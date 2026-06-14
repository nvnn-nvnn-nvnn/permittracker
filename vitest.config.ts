import { defineConfig } from "vitest/config";
import { resolve } from "node:path";


export default defineConfig({

    test: {
        environment: "node",
        include: ["**/*.test.ts"],
        env: {
            REMINDER_TOKEN_SECRET: "test-secret-xyz"
        },
    },
    resolve: {
        alias: {
            "@": resolve(__dirname, "."),
            "server-only": resolve(__dirname, "test/empty.ts"), 
        },
    },

});