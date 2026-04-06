import os
import smtplib
from email.message import EmailMessage
from email.utils import formataddr
from dotenv import load_dotenv

load_dotenv()


SMTP_HOST = (os.getenv("SMTP_HOST") or "").strip()
SMTP_PORT = int((os.getenv("SMTP_PORT") or "587").strip())
SMTP_USER = (os.getenv("SMTP_USER") or "").strip()
SMTP_PASS = (os.getenv("SMTP_PASS") or "").strip()
SMTP_FROM = (os.getenv("SMTP_FROM") or SMTP_USER).strip()
SMTP_ENABLED = (os.getenv("SMTP_ENABLED") or "false").strip().lower() == "true"


def send_email(to_email: str, subject: str, html_body: str, text_body: str | None = None):
    if not SMTP_ENABLED:
        raise RuntimeError("SMTP is disabled.")

    if not SMTP_HOST or not SMTP_PORT or not SMTP_USER or not SMTP_PASS:
        raise RuntimeError("SMTP configuration is incomplete.")

    if not to_email:
        raise RuntimeError("Recipient email is required.")

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = SMTP_FROM
    msg["To"] = to_email.strip()

    plain_text = text_body or "Please view this email in an HTML-compatible email client."
    msg.set_content(plain_text)
    msg.add_alternative(html_body, subtype="html")

    with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
        server.starttls()
        server.login(SMTP_USER, SMTP_PASS)
        server.send_message(msg)


def build_inquiry_reply_email_html(
    customer_name: str,
    inquiry_subject: str | None,
    inquiry_message: str,
    admin_reply: str,
):
    safe_name = customer_name or "Customer"
    safe_subject = inquiry_subject or "No Subject"

    html = f"""
    <html>
        <body style="margin:0;padding:0;background:#f7f7f7;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;">
            <div style="max-width:680px;margin:30px auto;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #eaeaea;">
                <div style="background:#111111;padding:28px 32px;">
                    <div style="font-size:26px;font-weight:900;color:#ffc244;letter-spacing:-0.5px;">
                        Teo D' Mango
                    </div>
                    <div style="font-size:12px;color:#f4d98a;margin-top:6px;text-transform:uppercase;letter-spacing:1px;">
                        Inquiry Response
                    </div>
                </div>

                <div style="padding:32px;">
                    <p style="margin:0 0 18px;font-size:15px;line-height:1.7;">
                        Hi <strong>{safe_name}</strong>,
                    </p>

                    <p style="margin:0 0 18px;font-size:15px;line-height:1.7;">
                        We have reviewed your inquiry and our team has sent a reply.
                    </p>

                    <div style="background:#fafafa;border:1px solid #ececec;border-radius:14px;padding:18px 20px;margin:22px 0;">
                        <div style="font-size:11px;font-weight:900;color:#d4a017;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">
                            Your Inquiry Subject
                        </div>
                        <div style="font-size:15px;font-weight:700;margin-bottom:14px;">
                            {safe_subject}
                        </div>

                        <div style="font-size:11px;font-weight:900;color:#d4a017;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">
                            Your Message
                        </div>
                        <div style="font-size:14px;line-height:1.7;white-space:pre-wrap;">
                            {inquiry_message}
                        </div>
                    </div>

                    <div style="background:rgba(255,194,68,0.10);border:1px solid rgba(212,160,23,0.35);border-radius:14px;padding:18px 20px;margin:22px 0;">
                        <div style="font-size:11px;font-weight:900;color:#b8860b;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">
                            Admin Reply
                        </div>
                        <div style="font-size:14px;line-height:1.8;white-space:pre-wrap;">
                            {admin_reply}
                        </div>
                    </div>

                    <p style="margin:22px 0 0;font-size:14px;line-height:1.7;color:#555;">
                        Thank you for reaching out to Teo D' Mango.
                    </p>
                </div>
            </div>
        </body>
    </html>
    """
    return html


def build_inquiry_reply_email_text(
    customer_name: str,
    inquiry_subject: str | None,
    inquiry_message: str,
    admin_reply: str,
):
    safe_name = customer_name or "Customer"
    safe_subject = inquiry_subject or "No Subject"

    return f"""Hi {safe_name},

We have reviewed your inquiry and our team has sent a reply.

Inquiry Subject:
{safe_subject}

Your Message:
{inquiry_message}

Admin Reply:
{admin_reply}

Thank you for reaching out to Teo D' Mango.
"""
    

def send_inquiry_reply_email(
    to_email: str,
    customer_name: str,
    inquiry_subject: str | None,
    inquiry_message: str,
    admin_reply: str,
):
    subject = f"Reply to your Teo D' Mango inquiry: {inquiry_subject or 'No Subject'}"

    html_body = build_inquiry_reply_email_html(
        customer_name=customer_name,
        inquiry_subject=inquiry_subject,
        inquiry_message=inquiry_message,
        admin_reply=admin_reply,
    )

    text_body = build_inquiry_reply_email_text(
        customer_name=customer_name,
        inquiry_subject=inquiry_subject,
        inquiry_message=inquiry_message,
        admin_reply=admin_reply,
    )

    send_email(
        to_email=to_email,
        subject=subject,
        html_body=html_body,
        text_body=text_body,
    )