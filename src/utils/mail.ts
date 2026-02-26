import nodemailer from "nodemailer";
import { MailtrapTransport } from "mailtrap";

const TOKEN = process.env.MAILTRAP_API_TOKEN;

if (!TOKEN) {
    throw new Error("MAILTRAP_API_TOKEN is not defined");
}

export const transporter = nodemailer.createTransport(
    MailtrapTransport({
        token: TOKEN,
    })
);

export const sender = {
    address: process.env.MAIL_SENDER_EMAIL || "hello@demomailtrap.com",
    name: process.env.MAIL_SENDER_NAME || "Support",
};

export async function sendEmail({
    to,
    subject,
    text,
    html,
    category,
}: {
    to: string;
    subject: string;
    text?: string;
    html?: string;
    category?: string;
}) {
    return transporter.sendMail({
        from: sender,
        to: to.toLowerCase().trim(),
        subject,
        text,
        html,
        category,
    });
}