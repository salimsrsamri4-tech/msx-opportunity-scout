import nodemailer from "nodemailer";

export async function sendEmail({ user, pass, to, subject, text }) {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
  await transporter.sendMail({ from: user, to, subject, text });
}
