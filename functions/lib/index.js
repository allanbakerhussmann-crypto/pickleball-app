"use strict";
/**
 * Firebase Cloud Functions - Main Entry Point
 *
 * FILE LOCATION: functions/src/index.ts
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
exports.admin_getAuditLogs = exports.admin_demoteFromOrganizer = exports.admin_promoteToOrganizer = exports.admin_demoteFromAppAdmin = exports.admin_promoteToAppAdmin = exports.stripe_webhook = exports.stripe_createCheckoutSession = exports.stripe_createUserConnectLoginLink = exports.stripe_createUserConnectAccount = exports.stripe_createConnectLoginLink = exports.stripe_getConnectAccountStatus = exports.stripe_createConnectAccount = void 0;
const admin = __importStar(require("firebase-admin"));
// Initialize Firebase Admin
admin.initializeApp();
// ============================================
// STRIPE FUNCTIONS
// ============================================
var stripe_1 = require("./stripe");
// Club Connect
Object.defineProperty(exports, "stripe_createConnectAccount", { enumerable: true, get: function () { return stripe_1.stripe_createConnectAccount; } });
Object.defineProperty(exports, "stripe_getConnectAccountStatus", { enumerable: true, get: function () { return stripe_1.stripe_getConnectAccountStatus; } });
Object.defineProperty(exports, "stripe_createConnectLoginLink", { enumerable: true, get: function () { return stripe_1.stripe_createConnectLoginLink; } });
// User/Organizer Connect (NEW)
Object.defineProperty(exports, "stripe_createUserConnectAccount", { enumerable: true, get: function () { return stripe_1.stripe_createUserConnectAccount; } });
Object.defineProperty(exports, "stripe_createUserConnectLoginLink", { enumerable: true, get: function () { return stripe_1.stripe_createUserConnectLoginLink; } });
// Checkout & Webhook
Object.defineProperty(exports, "stripe_createCheckoutSession", { enumerable: true, get: function () { return stripe_1.stripe_createCheckoutSession; } });
Object.defineProperty(exports, "stripe_webhook", { enumerable: true, get: function () { return stripe_1.stripe_webhook; } });
// ============================================
// ADMIN FUNCTIONS
// ============================================
var admin_1 = require("./admin");
Object.defineProperty(exports, "admin_promoteToAppAdmin", { enumerable: true, get: function () { return admin_1.admin_promoteToAppAdmin; } });
Object.defineProperty(exports, "admin_demoteFromAppAdmin", { enumerable: true, get: function () { return admin_1.admin_demoteFromAppAdmin; } });
Object.defineProperty(exports, "admin_promoteToOrganizer", { enumerable: true, get: function () { return admin_1.admin_promoteToOrganizer; } });
Object.defineProperty(exports, "admin_demoteFromOrganizer", { enumerable: true, get: function () { return admin_1.admin_demoteFromOrganizer; } });
Object.defineProperty(exports, "admin_getAuditLogs", { enumerable: true, get: function () { return admin_1.admin_getAuditLogs; } });
// ============================================
// TEAM FUNCTIONS (if you have them)
// ============================================
// export { createTeam } from './teams';
//# sourceMappingURL=index.js.map