import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { FormModal } from '../FormModal'

describe('FormModal', () => {
  it('renders title and children when open', () => {
    render(
      <FormModal open={true} onClose={vi.fn()} title="Test Modal">
        <div>Modal content</div>
      </FormModal>
    )
    expect(screen.getByText('Test Modal')).toBeInTheDocument()
    expect(screen.getByText('Modal content')).toBeInTheDocument()
  })

  it('does not render when closed', () => {
    render(
      <FormModal open={false} onClose={vi.fn()} title="Test Modal">
        <div>Modal content</div>
      </FormModal>
    )
    expect(screen.queryByText('Test Modal')).not.toBeInTheDocument()
    expect(screen.queryByText('Modal content')).not.toBeInTheDocument()
  })

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn()
    render(
      <FormModal open={true} onClose={onClose} title="Test Modal">
        <div>content</div>
      </FormModal>
    )
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
