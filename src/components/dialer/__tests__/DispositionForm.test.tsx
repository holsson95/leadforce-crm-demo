import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DispositionForm } from '../DispositionForm'

describe('DispositionForm', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve({
        json: () => Promise.resolve({
          data: {
            stages: [
              { id: 'stage1', name: 'Stage 1', color: '#FF0000' },
              { id: 'stage2', name: 'Stage 2', color: '#00FF00' },
            ],
            clientId: 'client1',
          },
        }),
      })
    ))
  })
  it('requires notes for a pipeline-eligible outcome before Log Outcome is enabled', () => {
    render(
      <DispositionForm
        campaignId={null}
        onSubmit={vi.fn()}
        loading={false}
        initialOutcome="meeting_booked"
        lockOutcome
      />
    )
    expect(screen.getByRole('button', { name: 'Log Outcome' })).toBeDisabled()
    expect(screen.getByText('Notes required for this outcome.')).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('Notes required for this outcome…'), {
      target: { value: 'Booked demo for Friday' },
    })
    expect(screen.getByRole('button', { name: 'Log Outcome' })).not.toBeDisabled()
  })

  it('does not require notes for a non-pipeline-eligible outcome', () => {
    render(
      <DispositionForm
        campaignId={null}
        onSubmit={vi.fn()}
        loading={false}
        initialOutcome="no_answer"
        lockOutcome
      />
    )
    expect(screen.getByRole('button', { name: 'Log Outcome' })).not.toBeDisabled()
    expect(screen.queryByText('Notes required for this outcome.')).not.toBeInTheDocument()
  })

  it('calls onSubmit with the outcome, notes, and no pipeline action when submitted', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(
      <DispositionForm
        campaignId={null}
        onSubmit={onSubmit}
        loading={false}
        initialOutcome="lead"
        lockOutcome
      />
    )
    fireEvent.change(screen.getByPlaceholderText('Notes required for this outcome…'), {
      target: { value: 'Interested in Q3' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Log Outcome' }))
    expect(onSubmit).toHaveBeenCalledWith('lead', 'Interested in Q3', undefined)
  })

  it('shows the locked outcome label and a Change link that calls onChangeOutcome', () => {
    const onChangeOutcome = vi.fn()
    render(
      <DispositionForm
        campaignId={null}
        onSubmit={vi.fn()}
        loading={false}
        initialOutcome="meeting_booked"
        lockOutcome
        onChangeOutcome={onChangeOutcome}
      />
    )
    expect(screen.getByText('Meeting Booked')).toBeInTheDocument()
    expect(screen.queryByText('Select outcome…')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('Change'))
    expect(onChangeOutcome).toHaveBeenCalledTimes(1)
  })

  it('renders a Cancel button that calls onCancel when provided', () => {
    const onCancel = vi.fn()
    render(
      <DispositionForm
        campaignId={null}
        onSubmit={vi.fn()}
        loading={false}
        initialOutcome="no_answer"
        lockOutcome
        onCancel={onCancel}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('shows the pipeline section for a pipeline-eligible locked outcome when campaignId is set', () => {
    render(
      <DispositionForm
        campaignId="camp1"
        onSubmit={vi.fn()}
        loading={false}
        initialOutcome="meeting_booked"
        lockOutcome
      />
    )
    expect(screen.getByText('Add to pipeline')).toBeInTheDocument()
  })

  it('seeds notes and pipeline selection from initialNotes/initialPipeline when editing', async () => {
    render(
      <DispositionForm
        campaignId="camp1"
        onSubmit={vi.fn()}
        loading={false}
        initialOutcome="meeting_booked"
        lockOutcome
        initialNotes="Booked demo for Friday"
        initialPipeline={{ stageId: 'stage1', addToQueue: false, clientId: 'client1' }}
      />
    )
    expect(screen.getByDisplayValue('Booked demo for Friday')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Log Outcome' })).not.toBeDisabled()
    })
    // "Add to pipeline" toggle should already be on since initialPipeline was provided
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true')
  })

  it('submits the seeded notes unchanged if the user does not edit them', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(
      <DispositionForm
        campaignId={null}
        onSubmit={onSubmit}
        loading={false}
        initialOutcome="lead"
        lockOutcome
        initialNotes="Interested in Q3"
      />
    )
    await waitFor(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Log Outcome' }))
    })
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith('lead', 'Interested in Q3', undefined)
    })
  })
})
