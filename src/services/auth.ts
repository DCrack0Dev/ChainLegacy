import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { adminDb } from '@/lib/firebase-admin';

/**
 * Authentication Service V3
 * Implements WebAuthn / Passkeys logic for passwordless and cryptographic vault access.
 */
export class AuthService {
  private static rpName = 'ChainLegacy';
  private static rpID = process.env.RP_ID || 'localhost';
  private static origin = process.env.ORIGIN || 'http://localhost:3000';

  /**
   * Generates options for a user to register a new Passkey.
   */
  static async getRegistrationOptions(userId: string, email: string) {
    const userDoc = await adminDb?.collection('users').doc(userId).get();
    const userAuthenticators = userDoc?.data()?.authenticators || [];

    const options = await generateRegistrationOptions({
      rpName: this.rpName,
      rpID: this.rpID,
      userID: Buffer.from(userId),
      userName: email,
      attestationType: 'none',
      excludeCredentials: userAuthenticators.map((auth: any) => ({
        id: auth.credentialID,
        type: 'public-key',
      })),
      authenticatorSelection: {
        residentKey: 'required',
        userVerification: 'preferred',
      },
    });

    // Store challenge temporarily
    await adminDb?.collection('users').doc(userId).update({
      currentRegistrationChallenge: options.challenge
    });

    return options;
  }

  /**
   * Verifies the Passkey registration response.
   */
  static async verifyRegistration(userId: string, body: any) {
    const userDoc = await adminDb?.collection('users').doc(userId).get();
    const expectedChallenge = userDoc?.data()?.currentRegistrationChallenge;

    const verification = await verifyRegistrationResponse({
      response: body,
      expectedChallenge,
      expectedOrigin: this.origin,
      expectedRPID: this.rpID,
    });

    if (verification.verified && verification.registrationInfo) {
      const { credential } = verification.registrationInfo;
      const { publicKey, id: credentialID, counter } = credential;

      const newAuthenticator = {
        credentialID: Buffer.from(credentialID).toString('base64'),
        credentialPublicKey: Buffer.from(publicKey).toString('base64'),
        counter,
        transports: body.response.transports,
      };

      await adminDb?.collection('users').doc(userId).update({
        authenticators: (userDoc?.data()?.authenticators || []).concat(newAuthenticator),
        currentRegistrationChallenge: null
      });

      return { success: true };
    }

    return { success: false };
  }
}
