"use strict";
/**
 * Receipt Email Module
 *
 * Creates receipt documents and sends email notifications via Amazon SES.
 * Supports payment receipts and refund receipts.
 *
 * @version 07.51
 * @file functions/src/receiptEmail.ts
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.receipt_resend = void 0;
exports.sendReceiptEmail = sendReceiptEmail;
exports.sendRefundReceiptEmail = sendRefundReceiptEmail;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const comms_1 = require("./comms");
function pad4(n) {
    return String(n).padStart(4, '0');
}
async function generateReceiptNumber(tx) {
    var _a;
    // RCP-YYMMDD-XXXX (XXXX increments per day)
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const dateKey = `${yy}${mm}${dd}`;
    const counterRef = admin.firestore().doc(`counters/receipts_${dateKey}`);
    const snap = await tx.get(counterRef);
    const next = (snap.exists ? (((_a = snap.data()) === null || _a === void 0 ? void 0 : _a.value) || 0) : 0) + 1;
    tx.set(counterRef, { value: next }, { merge: true });
    return `RCP-${dateKey}-${pad4(next)}`;
}
function centsToMoney(cents, currency) {
    const value = (cents / 100).toFixed(2);
    const symbol = currency === 'NZD' ? 'NZ$' : currency === 'AUD' ? 'A$' : '$';
    return `${symbol}${value}`;
}
function buildReceiptText(r) {
    var _a;
    const lines = [];
    lines.push(`${r.clubName || 'Pickleball Director'} — Payment Receipt`);
    lines.push(`Receipt: ${r.receiptNumber}`);
    lines.push(`Date: ${r.createdAt.toISOString()}`);
    lines.push(`Transaction: ${r.transactionId}`);
    lines.push('');
    lines.push(`Billed to: ${r.userName} <${r.userEmail}>`);
    lines.push(`For: ${r.eventName}`);
    lines.push('');
    lines.push('Items:');
    for (const it of r.items) {
        const qty = (_a = it.quantity) !== null && _a !== void 0 ? _a : 1;
        lines.push(`- ${it.name} x${qty}: ${centsToMoney(it.amount, r.currency)}`);
    }
    lines.push('');
    lines.push(`Total: ${centsToMoney(r.amount, r.currency)}`);
    if (r.cardLast4)
        lines.push(`Paid with card ending ${r.cardLast4}`);
    lines.push('');
    lines.push('Thank you!');
    return lines.join('\n');
}
function buildReceiptHtml(r) {
    const clubTitle = r.clubName || 'Pickleball Director';
    const rows = r.items
        .map((it) => {
        var _a;
        const qty = (_a = it.quantity) !== null && _a !== void 0 ? _a : 1;
        return `
        <tr>
          <td style="padding:10px 8px;border-bottom:1px solid #eee;">
            ${it.name} <span style="color:#666;">x${qty}</span>
          </td>
          <td style="padding:10px 8px;border-bottom:1px solid #eee;text-align:right;">
            ${centsToMoney(it.amount, r.currency)}
          </td>
        </tr>`;
    })
        .join('');
    return `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Receipt ${r.receiptNumber}</title>
</head>
<body style="margin:0;background:#f6f7f9;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:680px;margin:0 auto;padding:24px;">
    <div style="background:#111827;color:#fff;border-radius:14px;padding:18px 18px 14px;">
      <div style="display:flex;align-items:center;gap:12px;">
        ${r.clubLogoUrl ? `<img src="${r.clubLogoUrl}" alt="${clubTitle}" style="height:34px;border-radius:8px;" />` : ''}
        <div style="font-size:18px;font-weight:700;line-height:1.2;">${clubTitle}</div>
      </div>
      <div style="margin-top:10px;color:#cbd5e1;font-size:13px;">
        Payment Receipt
      </div>
    </div>

    <div style="background:#fff;border-radius:14px;margin-top:14px;padding:18px;box-shadow:0 2px 10px rgba(0,0,0,0.05);">
      <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;">
        <div>
          <div style="font-size:12px;color:#6b7280;">Receipt</div>
          <div style="font-size:16px;font-weight:700;">${r.receiptNumber}</div>
        </div>
        <div>
          <div style="font-size:12px;color:#6b7280;">Date</div>
          <div style="font-size:14px;font-weight:600;">${r.createdAt.toLocaleString()}</div>
        </div>
        <div>
          <div style="font-size:12px;color:#6b7280;">Transaction</div>
          <div style="font-size:14px;font-weight:600;">${r.transactionId}</div>
        </div>
      </div>

      <div style="margin-top:14px;padding-top:14px;border-top:1px solid #eee;">
        <div style="font-size:12px;color:#6b7280;">Billed to</div>
        <div style="font-size:14px;font-weight:600;">${r.userName} &lt;${r.userEmail}&gt;</div>
        <div style="margin-top:8px;font-size:12px;color:#6b7280;">For</div>
        <div style="font-size:14px;font-weight:600;">${r.eventName}</div>
      </div>

      <table style="width:100%;border-collapse:collapse;margin-top:14px;">
        <thead>
          <tr>
            <th style="text-align:left;padding:10px 8px;border-bottom:1px solid #eee;color:#6b7280;font-size:12px;">Item</th>
            <th style="text-align:right;padding:10px 8px;border-bottom:1px solid #eee;color:#6b7280;font-size:12px;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
          <tr>
            <td style="padding:12px 8px;font-weight:700;">Total</td>
            <td style="padding:12px 8px;text-align:right;font-weight:700;">
              ${centsToMoney(r.amount, r.currency)}
            </td>
          </tr>
        </tbody>
      </table>

      ${r.cardLast4 ? `<div style="margin-top:10px;color:#374151;font-size:13px;">Paid with card ending <b>${r.cardLast4}</b></div>` : ''}

      <div style="margin-top:16px;padding-top:14px;border-top:1px solid #eee;color:#6b7280;font-size:12px;">
        Need help? ${r.clubEmail ? `Contact: <a href="mailto:${r.clubEmail}">${r.clubEmail}</a>` : 'Reply to this email.'}
      </div>
    </div>
  </div>
</body>
</html>`;
}
async function getClubBranding(clubId) {
    var _a;
    if (!clubId)
        return {};
    const snap = await admin.firestore().doc(`clubs/${clubId}`).get();
    if (!snap.exists)
        return {};
    const d = snap.data() || {};
    return {
        clubName: d.name,
        clubLogoUrl: d.logoUrl || ((_a = d.branding) === null || _a === void 0 ? void 0 : _a.logoUrl),
        clubEmail: d.email || d.supportEmail,
    };
}
/**
 * Send a payment receipt email
 *
 * Creates a receipt document in Firestore and sends an email via SES.
 * Uses transactionId as the receipt doc ID for idempotency (prevents duplicates on webhook retries).
 */
async function sendReceiptEmail(params) {
    var _a;
    const db = admin.firestore();
    // Items default: one line item for the event
    const items = ((_a = params.items) === null || _a === void 0 ? void 0 : _a.length)
        ? params.items
        : [{ name: params.eventName || 'Payment', quantity: 1, amount: params.amount }];
    const branding = await getClubBranding(params.clubId);
    // Use transactionId as doc ID for idempotency (prevents duplicate receipts on webhook retries)
    const receiptRef = db.collection('receipts').doc(params.transactionId);
    // Check if receipt already exists (idempotency)
    const existingReceipt = await receiptRef.get();
    if (existingReceipt.exists) {
        console.log(`Receipt already exists for transaction ${params.transactionId}, skipping`);
        return;
    }
    // Create receipt with transactional receipt number
    let receiptNumber = '';
    await db.runTransaction(async (tx) => {
        receiptNumber = await generateReceiptNumber(tx);
        tx.set(receiptRef, {
            receiptNumber,
            transactionId: params.transactionId,
            odUserId: params.userId,
            userEmail: params.userEmail,
            userName: params.userName,
            paymentType: params.paymentType,
            amount: params.amount,
            currency: params.currency,
            eventName: params.eventName,
            clubId: params.clubId || null,
            items,
            cardLast4: params.cardLast4 || null,
            status: 'generated',
            createdAt: Date.now(),
            sentAt: null,
            emailMessageId: null,
            error: null,
        });
    });
    // Now send email (outside transaction)
    const createdAt = new Date();
    const text = buildReceiptText({
        receiptNumber,
        createdAt,
        transactionId: params.transactionId,
        userName: params.userName,
        userEmail: params.userEmail,
        eventName: params.eventName,
        amount: params.amount,
        currency: params.currency,
        items,
        cardLast4: params.cardLast4,
        clubName: branding.clubName,
    });
    const html = buildReceiptHtml({
        receiptNumber,
        createdAt,
        transactionId: params.transactionId,
        userName: params.userName,
        userEmail: params.userEmail,
        eventName: params.eventName,
        amount: params.amount,
        currency: params.currency,
        items,
        cardLast4: params.cardLast4,
        clubName: branding.clubName,
        clubLogoUrl: branding.clubLogoUrl,
        clubEmail: branding.clubEmail,
    });
    const subject = `Receipt ${receiptNumber} — ${branding.clubName || 'Pickleball Director'}`;
    const res = await (0, comms_1.sendEmail)(params.userEmail, subject, text, html);
    if (res.success) {
        await receiptRef.set({ status: 'sent', sentAt: Date.now(), emailMessageId: res.messageId || null, error: null }, { merge: true });
        console.log(`Receipt email sent: ${receiptNumber} to ${params.userEmail}`);
    }
    else {
        await receiptRef.set({ status: 'failed', error: res.error || 'Unknown email error' }, { merge: true });
        console.error(`Receipt email failed: ${receiptNumber} - ${res.error}`);
    }
}
/**
 * Send a refund receipt email
 *
 * Simplified refund receipt that reuses the payment receipt flow.
 */
async function sendRefundReceiptEmail(params) {
    if (!params.userEmail) {
        console.warn('Refund receipt skipped: no userEmail', { txId: params.originalTransactionId });
        return;
    }
    // Generate a unique transaction ID for the refund receipt
    const refundTxId = `refund_${params.originalTransactionId}_${Date.now()}`;
    await sendReceiptEmail({
        transactionId: refundTxId,
        userId: params.userId,
        userEmail: params.userEmail,
        userName: params.userName,
        paymentType: 'meetup', // Generic type for refunds
        amount: params.refundAmount,
        currency: (params.currency || 'NZD').toUpperCase(),
        eventName: params.eventName || 'Refund',
        clubId: params.clubId,
        items: [{ name: 'Refund', quantity: 1, amount: params.refundAmount }],
    });
}
/**
 * Callable function to resend a receipt by receiptId
 *
 * Can be called by organizers or admins to resend receipts.
 */
exports.receipt_resend = functions.https.onCall(async (data, context) => {
    const receiptId = data === null || data === void 0 ? void 0 : data.receiptId;
    if (!receiptId) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing receiptId');
    }
    // Optional: verify caller is organizer/admin
    // For now, require authentication
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }
    const snap = await admin.firestore().doc(`receipts/${receiptId}`).get();
    if (!snap.exists) {
        throw new functions.https.HttpsError('not-found', 'Receipt not found');
    }
    const r = snap.data();
    if (!r.userEmail) {
        throw new functions.https.HttpsError('failed-precondition', 'Receipt has no userEmail');
    }
    // Rebuild and resend
    const branding = await getClubBranding(r.clubId);
    const createdAt = new Date(r.createdAt);
    const text = buildReceiptText({
        receiptNumber: r.receiptNumber,
        createdAt,
        transactionId: r.transactionId,
        userName: r.userName || 'Customer',
        userEmail: r.userEmail,
        eventName: r.eventName || 'Payment',
        amount: r.amount,
        currency: r.currency,
        items: r.items || [{ name: 'Payment', quantity: 1, amount: r.amount }],
        cardLast4: r.cardLast4,
        clubName: branding.clubName,
    });
    const html = buildReceiptHtml({
        receiptNumber: r.receiptNumber,
        createdAt,
        transactionId: r.transactionId,
        userName: r.userName || 'Customer',
        userEmail: r.userEmail,
        eventName: r.eventName || 'Payment',
        amount: r.amount,
        currency: r.currency,
        items: r.items || [{ name: 'Payment', quantity: 1, amount: r.amount }],
        cardLast4: r.cardLast4,
        clubName: branding.clubName,
        clubLogoUrl: branding.clubLogoUrl,
        clubEmail: branding.clubEmail,
    });
    const subject = `Receipt ${r.receiptNumber} — ${branding.clubName || 'Pickleball Director'}`;
    const res = await (0, comms_1.sendEmail)(r.userEmail, subject, text, html);
    if (res.success) {
        await snap.ref.set({ status: 'sent', sentAt: Date.now(), emailMessageId: res.messageId || null, error: null }, { merge: true });
        console.log(`Receipt resent: ${r.receiptNumber} to ${r.userEmail}`);
        return { ok: true, messageId: res.messageId };
    }
    else {
        await snap.ref.set({ error: res.error || 'Unknown email error' }, { merge: true });
        throw new functions.https.HttpsError('internal', res.error || 'Failed to send email');
    }
});
//# sourceMappingURL=receiptEmail.js.map