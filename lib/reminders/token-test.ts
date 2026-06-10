import "server-only"

// Importing Vitest

import {describe, it, expect, vi, beforeAll, } from "vitest";
import { createAcknowledgeToken } from "./token";

beforeAll(() => {process.env.REMINDER_TOKEN_SECRET = "test-secret-xyz"; });

import { createAcknowledgeToken, verifyAcknowledgeToken } from "./token";





describe("acknowledge tokens", () = {
    it("round-trips a valid token", () = {
        expect(verifyAcknowledgeToken(createAcknowledgeToken("d1")));
    })
})