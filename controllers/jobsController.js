import Job from '../models/Job.js'
import { StatusCodes } from 'http-status-codes'
import { BadRequestError, NotFoundError } from '../errors/index.js'
import checkPermissions from '../utils/checkPermissions.js'
import mongoose from 'mongoose'

const createJob = async (req, res) => {
  const { position, company } = req.body

  if (!position || !company) {
    throw new BadRequestError('Please Provide All Values')
  }

  req.body.createdBy = req.user.userId

  const job = await Job.create(req.body)
  res.status(StatusCodes.CREATED).json({ job })
}

const getAllJobs = async (req, res) => {
  const { search, status, jobType, sort } = req.query

  const queryObject = {
    createdBy: req.user.userId,
  }

  if (status && status !== 'all') {
    queryObject.status = status
  }
  if (jobType !== 'all') {
    queryObject.jobType = jobType
  }
  if (search) {
    queryObject.position = { $regex: search, $options: 'i' }
  }

  // NO AWAIT
  let result = Job.find(queryObject)

  // chain sort conditions
  if (sort === 'latest') {
    result = result.sort('-createdAt')
  }
  if (sort === 'oldest') {
    result = result.sort('createdAt')
  }
  if (sort === 'a-z') {
    result = result.sort('position')
  }
  if (sort === 'z-a') {
    result = result.sort('-position')
  }

  // setup pagination
  const page = Number(req.query.page) || 1
  const limit = Number(req.query.limit) || 10
  const skip = (page - 1) * limit //10
  result = result.skip(skip).limit(limit)

 
  const jobs = await result

  const totalJobs = await Job.countDocuments(queryObject)
  const numOfPages = Math.ceil(totalJobs / limit)
  const itemsPage = jobs.length

  res.status(StatusCodes.OK).json({ jobs, totalJobs, numOfPages, itemsPage })
}

const deleteJob = async (req, res) => {
  const { id: jobId } = req.params

  const job = await Job.findOne({ _id: jobId })

  if (!job) {
    throw new CustomError.NotFoundError(`No job with id : ${jobId}`)
  }

  checkPermissions(req.user, job.createdBy)

  await job.remove()
  res.status(StatusCodes.OK).json({ msg: 'Success! Job removed' })
}

const updateJob = async (req, res) => {
  const { id: jobId } = req.params
  const { company, position, status } = req.body

  if (!position || !company) {
    throw new BadRequestError('Please provide all values')
  }

  const job = await Job.findOne({ _id: jobId })

  if (!job) {
    throw new NotFoundError(`No job with id :${jobId}`)
  }

  // check permissions
  // req.user.userId (string) === job.createdBy(object)
  // throw new UnAuthorizedError('Not authorized to access this route')

  // console.log(typeof req.user.userId)
  // console.log(typeof job.createdBy)

  checkPermissions(req.user, job.createdBy)

  const updatedJob = await Job.findOneAndUpdate({ _id: jobId }, req.body, {
    new: true,
    runValidators: true,
  })

  res.status(StatusCodes.OK).json({ updatedJob })
}

const showStats = async (req, res) => {
  let stats = await Job.aggregate([
    { $match: { createdBy: mongoose.Types.ObjectId(req.user.userId) } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ])

  stats = stats.reduce((acc, curr) => {
    const { _id: title, count } = curr
    acc[title] = count
    return acc
  }, {})

  const defaultStats = {
    pending: stats.pending || 0,
    interview: stats.interview || 0,
    declined: stats.declined || 0,
  }

  let monthlyApplications = await Job.aggregate([
    { $match: { createdBy: mongoose.Types.ObjectId(req.user.userId) } },
    {
      $group: {
        _id: {
          year: {
            $year: '$createdAt',
          },
          month: {
            $month: '$createdAt',
          },
        },
        count: { $sum: 1 },
      },
    },
    { $sort: { '_id.year': -1, '_id.month': -1 } },
    { $limit: 6 },
  ])
  res.status(StatusCodes.OK).json({ stats, monthlyApplications })
}




export {createJob, deleteJob, getAllJobs, updateJob, showStats}