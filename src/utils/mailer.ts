import { BrevoClient } from "@getbrevo/brevo";

const BREVO_API_KEY = String(process.env.BREVO_API_KEY || "").trim();

let brevoClient: BrevoClient | null = null;

function isPlaceholderKey(key: string): boolean {
    return key === "" || key === "your-brevo-api-key";
}

function getBrevoClient(): BrevoClient {
    if (isPlaceholderKey(BREVO_API_KEY)) {
        throw new Error("BREVO_API_KEY is missing or still using placeholder value");
    }

    if (!brevoClient) {
        brevoClient = new BrevoClient({
            apiKey: BREVO_API_KEY,
        });
    }

    return brevoClient;
}

export const sender = {
    address: process.env.MAIL_SENDER_EMAIL || "noreply@ileycom.tn",
    name: process.env.MAIL_SENDER_NAME || "Ileycom Support",
};

export function getBrevoConfigStatus() {
    return {
        keyConfigured: !isPlaceholderKey(BREVO_API_KEY),
        senderEmailConfigured: String(sender.address || "").trim() !== "",
        senderNameConfigured: String(sender.name || "").trim() !== "",
    };
}

export async function sendEmail({
    to,
    subject,
    text,
    html,
}: {
    to: string;
    subject: string;
    text?: string;
    html?: string;
}): Promise<any> {
    try {
        const recipient = String(to || "").toLowerCase().trim();
        if (!recipient) {
            throw new Error("Recipient email is required");
        }

        if (!html && !text) {
            throw new Error("Either html or text email content is required");
        }

        const client = getBrevoClient();
        const result = await client.transactionalEmails.sendTransacEmail({
            to: [{ email: to.toLowerCase().trim() }],
            subject,
            sender: {
                email: sender.address,
                name: sender.name,
            },
            ...(html && { htmlContent: html }),
            ...(text && { textContent: text }),
        });
        return result;
    } catch (error) {
        console.error("Brevo email send failed:", error);
        throw error;
    }
}