'use client'

import { useState } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  ChevronLeft, ChevronRight, Copy, Check, Download, Trash2,
  MoreHorizontal, Plus, Upload,
} from 'lucide-react'
import type { ContactWithCampaign } from '@/types/models'
import { ContactModal } from '@/components/contacts/ContactModal'
import { FormModal } from '@/components/shared/FormModal'
import { ImportWizard } from '@/components/imports/ImportWizard'

const STATUS_STYLES: Record<string, string> = {
  prospect: 'bg-[var(--lf-accent)]/10 text-[var(--lf-accent)]',
  lead: 'bg-emerald-500/10 text-emerald-400',
  dnc: 'bg-red-500/10 text-red-400',
  future: 'bg-gray-500/10 text-[var(--text-secondary)]',
  call_back: 'bg-[var(--lf-accent)]/10 text-amber-400',
  meeting_booked: 'bg-purple-500/10 text-purple-400',
}

const STATUS_LABELS: Record<string, string> = {
  prospect: 'Prospect',
  lead: 'Lead',
  dnc: 'DNC',
  future: 'Future',
  call_back: 'Call Back',
  meeting_booked: 'Meeting Booked',
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        navigator.clipboard.writeText(value)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
      className="ml-1 opacity-0 group-hover:opacity-100 transition-opacity text-[var(--text-muted)] hover:text-[var(--lf-accent)]"
      title="Copy to clipboard"
    >
      {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
    </button>
  )
}

interface ContactsTableProps {
  contacts: ContactWithCampaign[]
  campaigns: { id: string; name: string }[]
  users: { id: string; name: string }[]
  page: number
  pageSize: number
  total: number
}

export function ContactsTable({ contacts, campaigns, users, page, pageSize, total }: ContactsTableProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isDeleting, setIsDeleting] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editContact, setEditContact] = useState<ContactWithCampaign | null>(null)
  const [importOpen, setImportOpen] = useState(false)

  const allSelected = contacts.length > 0 && contacts.every((c) => selectedIds.has(c.id))
  const toggleAll = () =>
    setSelectedIds(allSelected ? new Set() : new Set(contacts.map((c) => c.id)))
  const toggleOne = (id: string) => {
    const next = new Set(selectedIds)
    next.has(id) ? next.delete(id) : next.add(id)
    setSelectedIds(next)
  }

  const handleBulkDelete = async () => {
    if (!confirm(`Delete ${selectedIds.size} contact${selectedIds.size !== 1 ? 's' : ''}? This cannot be undone.`)) return
    setIsDeleting(true)
    await fetch('/api/contacts', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: Array.from(selectedIds) }),
    })
    setSelectedIds(new Set())
    setIsDeleting(false)
    router.refresh()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this contact? This cannot be undone.')) return
    await fetch(`/api/contacts/${id}`, { method: 'DELETE' })
    router.refresh()
  }

  const goToPage = (p: number) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('page', String(p))
    router.push(`${pathname}?${params.toString()}`)
  }

  const totalPages = Math.ceil(total / pageSize) || 1
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1
  const rangeEnd = Math.min(page * pageSize, total)

  return (
    <div className="glass-panel rounded-2xl overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between p-4 border-b border-[var(--panel-border)]">
        <div className="flex items-center gap-3">
          <span className="text-sm text-[var(--text-secondary)]">
            {total} contact{total !== 1 ? 's' : ''}
            {selectedIds.size > 0 && ` · ${selectedIds.size} selected`}
          </span>
          {selectedIds.size > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleBulkDelete}
              disabled={isDeleting}
              className="gap-1"
            >
              <Trash2 className="h-3 w-3" />
              Delete {selectedIds.size}
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open('/api/contacts/export', '_blank')}
            className="gap-1 border-[var(--panel-border)] bg-[var(--panel-border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <Download className="h-3 w-3" />
            Export CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setImportOpen(true)}
            className="gap-1 border-[var(--panel-border)] bg-[var(--panel-border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <Upload className="h-3 w-3" />
            Import
          </Button>
          <Button
            size="sm"
            onClick={() => { setEditContact(null); setModalOpen(true) }}
            className="gap-1 bg-[var(--lf-accent)] text-black hover:bg-[var(--lf-accent)]/90"
          >
            <Plus className="h-3 w-3" />
            New Contact
          </Button>
        </div>
      </div>

      {/* Table */}
      {contacts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-[var(--text-secondary)] text-sm mb-4">No contacts found</p>
          <Button
            size="sm"
            onClick={() => { setEditContact(null); setModalOpen(true) }}
            className="bg-[var(--lf-accent)] text-black hover:bg-[var(--lf-accent)]/90"
          >
            Add your first contact
          </Button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--panel-border)]">
                <th className="p-3 w-10">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={toggleAll}
                  />
                </th>
                <th className="p-3 text-left text-xs font-medium text-[var(--text-secondary)] whitespace-nowrap">Name</th>
                <th className="p-3 text-left text-xs font-medium text-[var(--text-secondary)] whitespace-nowrap">Company</th>
                <th className="p-3 text-left text-xs font-medium text-[var(--text-secondary)] whitespace-nowrap">Mobile Phone</th>
                <th className="p-3 text-left text-xs font-medium text-[var(--text-secondary)] whitespace-nowrap">Corporate Phone</th>
                <th className="p-3 text-left text-xs font-medium text-[var(--text-secondary)] whitespace-nowrap">Email</th>
                <th className="p-3 text-left text-xs font-medium text-[var(--text-secondary)] whitespace-nowrap">Status</th>
                <th className="p-3 text-left text-xs font-medium text-[var(--text-secondary)] whitespace-nowrap">Campaign</th>
                <th className="p-3 w-10" />
              </tr>
            </thead>
            <tbody>
              {contacts.map((contact) => (
                <tr
                  key={contact.id}
                  className="group border-b border-[var(--panel-border)] hover:bg-[var(--panel-border-hover)] cursor-pointer"
                  onClick={() => { setEditContact(contact); setModalOpen(true) }}
                >
                  <td
                    className="p-3"
                    onClick={(e) => { e.stopPropagation(); toggleOne(contact.id) }}
                  >
                    <Checkbox checked={selectedIds.has(contact.id)} onCheckedChange={() => toggleOne(contact.id)} />
                  </td>
                  <td className="p-3 font-medium text-[var(--text-primary)] whitespace-nowrap">
                    {contact.firstName} {contact.lastName}
                  </td>
                  <td className="p-3 text-[var(--text-secondary)] text-sm">{contact.companyName ?? '—'}</td>
                  <td className="p-3 text-sm">
                    {contact.mobilePhone ? (
                      <span className="flex items-center text-[var(--text-secondary)] font-mono">
                        {contact.mobilePhone}
                        <CopyButton value={contact.mobilePhone} />
                      </span>
                    ) : <span className="text-[var(--text-muted)]">—</span>}
                  </td>
                  <td className="p-3 text-sm">
                    {contact.corporatePhone ? (
                      <span className="flex items-center text-[var(--text-secondary)] font-mono">
                        {contact.corporatePhone}
                        <CopyButton value={contact.corporatePhone} />
                      </span>
                    ) : <span className="text-[var(--text-muted)]">—</span>}
                  </td>
                  <td className="p-3 text-sm">
                    {contact.email ? (
                      <span className="flex items-center text-[var(--text-secondary)]">
                        {contact.email}
                        <CopyButton value={contact.email} />
                      </span>
                    ) : <span className="text-[var(--text-muted)]">—</span>}
                  </td>
                  <td className="p-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[contact.status] ?? ''}`}>
                      {STATUS_LABELS[contact.status] ?? contact.status}
                    </span>
                  </td>
                  <td className="p-3 text-[var(--text-secondary)] text-sm">{contact.campaign.name}</td>
                  <td className="p-3" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        }
                      />
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => { setEditContact(contact); setModalOpen(true) }}>
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-red-400 focus:text-red-400"
                          onClick={() => handleDelete(contact.id)}
                        >
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination footer */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--panel-border)]">
        <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          {total > 0 ? `Showing ${rangeStart}–${rangeEnd} of ${total}` : 'No results'}
          <Select
            value={String(pageSize)}
            onValueChange={(v) => {
              const params = new URLSearchParams(searchParams.toString())
              params.set('pageSize', v ?? '25')
              params.delete('page')
              router.push(`${pathname}?${params.toString()}`)
            }}
          >
            <SelectTrigger className="w-24 h-7 bg-[var(--panel-border)] border-[var(--panel-border)] text-xs ml-2">
              <SelectValue>{(v: string) => `${v} / page`}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="25">25 / page</SelectItem>
              <SelectItem value="50">50 / page</SelectItem>
              <SelectItem value="100">100 / page</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            disabled={page <= 1}
            onClick={() => goToPage(page - 1)}
            className="h-7 w-7"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-[var(--text-secondary)] px-2">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="ghost"
            size="icon"
            disabled={page >= totalPages}
            onClick={() => goToPage(page + 1)}
            className="h-7 w-7"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Modals */}
      <ContactModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        contact={editContact}
        campaigns={campaigns}
        users={users}
        defaultCampaignId={undefined}
      />

      <FormModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import Contacts"
        width="lg"
      >
        <div className="overflow-y-auto max-h-[75vh] custom-scrollbar">
          <ImportWizard
            campaigns={campaigns}
            onComplete={() => { setImportOpen(false); router.refresh() }}
          />
        </div>
      </FormModal>
    </div>
  )
}
