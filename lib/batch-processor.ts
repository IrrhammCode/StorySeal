/**
 * Batch Processor for IP Registration
 * Handle batch generation and registration of multiple IP assets
 */

import { IPAsset } from '@/services/story-protocol'
import { Account } from 'viem'

export interface BatchJob {
  id: string
  prompts: string[]
  status: 'pending' | 'generating' | 'registering' | 'completed' | 'error'
  progress: {
    total: number
    completed: number
    failed: number
  }
  results: BatchResult[]
  createdAt: string
  completedAt?: string
}

export interface BatchResult {
  prompt: string
  status: 'success' | 'failed'
  ipId?: string
  imageUrl?: string
  error?: string
}

export class BatchProcessor {
  private jobs: Map<string, BatchJob> = new Map()

  /**
   * Create new batch job
   */
  createJob(prompts: string[]): BatchJob {
    const job: BatchJob = {
      id: `batch_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      prompts,
      status: 'pending',
      progress: {
        total: prompts.length,
        completed: 0,
        failed: 0,
      },
      results: [],
      createdAt: new Date().toISOString(),
    }

    this.jobs.set(job.id, job)
    this.saveJobs()
    return job
  }

  /**
   * Get job by ID
   */
  getJob(jobId: string): BatchJob | null {
    return this.jobs.get(jobId) || null
  }

  /**
   * Update job progress
   */
  updateJob(jobId: string, updates: Partial<BatchJob>): void {
    const job = this.jobs.get(jobId)
    if (!job) return

    Object.assign(job, updates)
    this.jobs.set(jobId, job)
    this.saveJobs()
  }

  /**
   * Add result to job
   */
  addResult(jobId: string, result: BatchResult): void {
    const job = this.jobs.get(jobId)
    if (!job) return

    job.results.push(result)
    job.progress.completed++
    if (result.status === 'failed') {
      job.progress.failed++
    }

    // Check if job is complete
    if (job.progress.completed >= job.progress.total) {
      job.status = 'completed'
      job.completedAt = new Date().toISOString()
    }

    this.jobs.set(jobId, job)
    this.saveJobs()
  }

  /**
   * Get all jobs
   */
  getAllJobs(): BatchJob[] {
    return Array.from(this.jobs.values())
  }

  /**
   * Get recent jobs
   */
  getRecentJobs(limit: number = 10): BatchJob[] {
    return Array.from(this.jobs.values())
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit)
  }

  private saveJobs() {
    if (typeof window !== 'undefined') {
      const data = Array.from(this.jobs.values())
      localStorage.setItem('storyseal_batch_jobs', JSON.stringify(data))
    }
  }

  private loadJobs() {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('storyseal_batch_jobs')
      if (stored) {
        try {
          const data = JSON.parse(stored)
          data.forEach((job: BatchJob) => {
            this.jobs.set(job.id, job)
          })
        } catch (error) {
          console.error('Failed to load batch jobs:', error)
        }
      }
    }
  }

  constructor() {
    this.loadJobs()
  }
}

// Singleton instance
export const batchProcessor = new BatchProcessor()

