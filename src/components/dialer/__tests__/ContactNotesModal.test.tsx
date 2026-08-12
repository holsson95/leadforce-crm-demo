import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ContactNotesModal } from '../ContactNotesModal'

function mockFetch() {
  return vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [] }) }) as unknown as typeof fetch
}

describe('ContactNotesModal — deferSave mode', () => {
  beforeEach(() => {
    global.fetch = mockFetch()
  })

  it('stages a note via onStageNote instead of posting when deferSave is true', async () => {
    const onStageNote = vi.fn()
    render(
      <ContactNotesModal
        contactId="c1"
        contactName="John Doe"
        open={true}
        onClose={vi.fn()}
        hideOutcome
        deferSave
        pendingNotes={[]}
        onStageNote={onStageNote}
        onUpdatePendingNote={vi.fn()}
        onDeletePendingNote={vi.fn()}
      />
    )
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    fireEvent.change(screen.getByPlaceholderText('Add a note…'), { target: { value: 'Follow up Monday' } })
    fireEvent.click(screen.getByRole('button', { name: /Add Note/ }))
    expect(onStageNote).toHaveBeenCalledWith('Follow up Monday')
    expect(global.fetch).not.toHaveBeenCalledWith(expect.stringContaining('/notes'), expect.objectContaining({ method: 'POST' }))
  })

  it('renders pending notes above history with a Draft badge', async () => {
    render(
      <ContactNotesModal
        contactId="c1"
        contactName="John Doe"
        open={true}
        onClose={vi.fn()}
        hideOutcome
        deferSave
        pendingNotes={[{ id: 'p1', content: 'Follow up Monday' }]}
        onStageNote={vi.fn()}
        onUpdatePendingNote={vi.fn()}
        onDeletePendingNote={vi.fn()}
      />
    )
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    expect(screen.getByText('Follow up Monday')).toBeInTheDocument()
    expect(screen.getByText('Draft')).toBeInTheDocument()
  })

  it('Edit on a pending note loads it into the textarea and Update Note calls onUpdatePendingNote', async () => {
    const onUpdatePendingNote = vi.fn()
    render(
      <ContactNotesModal
        contactId="c1"
        contactName="John Doe"
        open={true}
        onClose={vi.fn()}
        hideOutcome
        deferSave
        pendingNotes={[{ id: 'p1', content: 'Follow up Monday' }]}
        onStageNote={vi.fn()}
        onUpdatePendingNote={onUpdatePendingNote}
        onDeletePendingNote={vi.fn()}
      />
    )
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: 'Edit note' }))
    expect(screen.getByPlaceholderText('Add a note…')).toHaveValue('Follow up Monday')
    fireEvent.change(screen.getByPlaceholderText('Add a note…'), { target: { value: 'Follow up Tuesday' } })
    fireEvent.click(screen.getByRole('button', { name: /Update Note/ }))
    expect(onUpdatePendingNote).toHaveBeenCalledWith('p1', 'Follow up Tuesday')
  })

  it('Delete on a pending note confirms then calls onDeletePendingNote', async () => {
    const onDeletePendingNote = vi.fn()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(
      <ContactNotesModal
        contactId="c1"
        contactName="John Doe"
        open={true}
        onClose={vi.fn()}
        hideOutcome
        deferSave
        pendingNotes={[{ id: 'p1', content: 'Follow up Monday' }]}
        onStageNote={vi.fn()}
        onUpdatePendingNote={vi.fn()}
        onDeletePendingNote={onDeletePendingNote}
      />
    )
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: 'Delete note' }))
    expect(confirmSpy).toHaveBeenCalledWith('Delete this note?')
    expect(onDeletePendingNote).toHaveBeenCalledWith('p1')
    confirmSpy.mockRestore()
  })

  it('still posts immediately when deferSave is not set (List view, unchanged)', async () => {
    render(
      <ContactNotesModal
        contactId="c1"
        contactName="John Doe"
        open={true}
        onClose={vi.fn()}
      />
    )
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { id: 'n1' } }) })
    fireEvent.change(screen.getByPlaceholderText('Add a note…'), { target: { value: 'Immediate note' } })
    fireEvent.click(screen.getAllByText('Add Note')[1])  // submit button (second "Add Note")
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/contacts/c1/notes',
        expect.objectContaining({ method: 'POST' })
      )
    )
  })
})
