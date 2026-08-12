import { z } from 'zod'

export const ClientSchema = z.object({
  name:        z.string().min(1, 'Name is required'),
  contactName: z.string().optional(),
  email:       z.string().email('Invalid email').optional().or(z.literal('')),
  phone:       z.string().optional(),
  website:     z.string().url('Invalid URL').optional().or(z.literal('')),
})

export type ClientFormData = z.infer<typeof ClientSchema>
