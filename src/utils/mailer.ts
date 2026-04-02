import { BrevoClient } from "@getbrevo/brevo";

const BREVO_API_KEY = process.env.BREVO_API_KEY;

if (!BREVO_API_KEY) {
    throw new Error("BREVO_API_KEY is not defined");
}

// Initialize Brevo client
const brevoClient = new BrevoClient({
    apiKey: BREVO_API_KEY,
});

export const sender = {
    address: process.env.MAIL_SENDER_EMAIL || "noreply@ileycom.tn",
    name: process.env.MAIL_SENDER_NAME || "Ileycom Support",
};

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
        const result = await brevoClient.transactionalEmails.sendTransacEmail({
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