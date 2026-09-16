import { z } from 'zod';

export type ContactRole = 'beneficiary' | 'guardian';

export type Contact = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: ContactRole;
};

export type VaultStatus = 'active' | 'warning' | 'grace' | 'triggered';

export type Vault = {
  id: string;
  ownerId: string;
  status: VaultStatus;
  lastCheckIn: number;
  interval: number;
  contacts: Contact[];
  createdAt: number;
};

export const ContactSchema = z.object({
  id: z.string(),
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email format"),
  phone: z.string().optional(),
  role: z.enum(['beneficiary', 'guardian'])
});

export const VaultSchema = z.object({
  id: z.string(),
  ownerId: z.string(),
  status: z.enum(['active', 'warning', 'grace', 'triggered']),
  lastCheckIn: z.number(),
  interval: z.number(),
  contacts: z.array(ContactSchema),
  createdAt: z.number()
});
