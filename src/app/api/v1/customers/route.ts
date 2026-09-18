import { z } from 'zod';
import { v1Route, structuredJson } from '@/lib/v1-route';
import { ApiError } from '@/lib/api-errors';
import { adminDb } from '@/lib/firebase-admin';
import { IdentityVerificationStatus } from '@/types/enterprise';

export const dynamic = 'force-dynamic';

const ListCustomersSchema = z.object({
  partnerCustomerId: z.string().optional(),
  firebaseUid: z.string().optional(),
  email: z.string().email().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

const CreateCustomerSchema = z.object({
  partnerCustomerId: z.string().min(1),
  email: z.string().email(),
  fullName: z.string().min(1),
  phone: z.string().optional(),
  walletAddress: z.string().optional(),
  firebaseUid: z.string().optional(),
  organizationId: z.string().optional(),
});

export const GET = v1Route({
  method: 'GET',
  scope: 'customers:read',
  requireOrg: true,
  async handle({ auth, searchParams, requestId }) {
    const parsed = ListCustomersSchema.safeParse(Object.fromEntries(searchParams));
    if (!parsed.success) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid query', parsed.error.format());
    }
    if (!adminDb) throw new ApiError(500, 'DB_UNAVAILABLE', 'Database not initialized');

    const orgId = auth.organizationId!;
    const { partnerCustomerId, firebaseUid, email, limit, offset } = parsed.data;

    let query: FirebaseFirestore.Query = adminDb
      .collection('organizations')
      .doc(orgId)
      .collection('customers')
      .where('organizationId', '==', orgId)
      .orderBy('createdAt', 'desc');

    if (partnerCustomerId) query = query.where('partnerCustomerId', '==', partnerCustomerId);
    if (firebaseUid) query = query.where('firebaseUid', '==', firebaseUid);
    if (email) query = query.where('email', '==', email);

    const snap = await query.limit(limit + 1).offset(offset).get();
    const customers = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const hasMore = customers.length > limit;
    const items = hasMore ? customers.slice(0, limit) : customers;

    return structuredJson({
      data: items,
      meta: { limit, offset, hasMore, total: items.length + offset },
      requestId,
    });
  },
});

export const POST = v1Route({
  method: 'POST',
  scope: 'customers:write',
  requireOrg: true,
  bodySchema: CreateCustomerSchema,
  async handle({ auth, body, requestId }) {
    if (!adminDb) throw new ApiError(500, 'DB_UNAVAILABLE', 'Database not initialized');
    const orgId = auth.organizationId!;
    const { partnerCustomerId, email, fullName, phone, walletAddress, firebaseUid } = body;

    const existingPartner = await adminDb
      .collection('organizations')
      .doc(orgId)
      .collection('customers')
      .where('partnerCustomerId', '==', partnerCustomerId)
      .limit(1)
      .get();
    if (!existingPartner.empty) {
      throw new ApiError(409, 'DUPLICATE_PARTNER_CUSTOMER_ID', 'partnerCustomerId already exists');
    }

    if (firebaseUid) {
      const existingFirebase = await adminDb
        .collection('organizations')
        .doc(orgId)
        .collection('customers')
        .where('firebaseUid', '==', firebaseUid)
        .limit(1)
        .get();
      if (!existingFirebase.empty) {
        throw new ApiError(409, 'DUPLICATE_FIREBASE_UID', 'firebaseUid already linked to another customer');
      }
    }

    const customerId = `cust_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date();
    const customer = {
      id: customerId,
      organizationId: orgId,
      partnerCustomerId,
      email,
      fullName,
      phone,
      walletAddress,
      firebaseUid: firebaseUid ?? null,
      vaultId: null,
      verificationStatus: IdentityVerificationStatus.NOT_STARTED,
      createdAt: now,
      updatedAt: now,
    };

    await adminDb
      .collection('organizations')
      .doc(orgId)
      .collection('customers')
      .doc(customerId)
      .set(customer);

    return structuredJson({ customer, requestId }, 201);
  },
});
