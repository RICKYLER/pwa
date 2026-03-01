import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

export async function POST(req: NextRequest) {
  try {
    const { to, name, email, password, role, loginUrl } = await req.json();

    // Validate required fields
    if (!to || !name || !email || !password) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = parseInt(process.env.SMTP_PORT || '465', 10);
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const smtpFrom = process.env.SMTP_FROM || `"PWA-ACCOUNT" <${smtpUser}>`;

    if (!smtpHost || !smtpUser || !smtpPass) {
      return NextResponse.json(
        { error: 'SMTP not configured. Please set SMTP_HOST, SMTP_USER, and SMTP_PASS in .env.local' },
        { status: 503 }
      );
    }

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465, // SSL for port 465, STARTTLS for 587
      auth: { user: smtpUser, pass: smtpPass },
    });

    const roleLabels: Record<string, string> = {
      admin: 'Administrator',
      encoder: 'Encoder',
      health_worker: 'Health Worker',
      responder: 'Responder',
    };
    const roleLabel = roleLabels[role] || role;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const loginLink = loginUrl || `${appUrl}/login`;

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Your MSWDO Census Account</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:560px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:32px 40px;text-align:center;">
              <div style="display:inline-flex;align-items:center;justify-content:center;width:52px;height:52px;background:rgba(255,255,255,0.2);border-radius:14px;margin-bottom:16px;">
                <span style="font-size:24px;">📋</span>
              </div>
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.3px;">MSWDO Census System</h1>
              <p style="margin:6px 0 0;color:rgba(255,255,255,0.75);font-size:13px;">Your account has been created</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 40px;">
              <p style="margin:0 0 8px;color:#334155;font-size:16px;font-weight:600;">Hello, ${name}! 👋</p>
              <p style="margin:0 0 28px;color:#64748b;font-size:14px;line-height:1.6;">
                An administrator has created your account on the MSWDO Barangay Census System. Use the credentials below to log in.
              </p>

              <!-- Credentials card -->
              <div style="background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:14px;padding:24px;margin-bottom:28px;">
                <p style="margin:0 0 16px;color:#475569;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;">Your Login Credentials</p>
                
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;">
                      <span style="display:block;font-size:11px;color:#94a3b8;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px;">Email Address</span>
                      <span style="font-size:14px;font-weight:600;color:#1e293b;">${email}</span>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;">
                      <span style="display:block;font-size:11px;color:#94a3b8;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px;">Password</span>
                      <span style="font-family:monospace;font-size:16px;font-weight:700;color:#4f46e5;background:#eef2ff;padding:4px 10px;border-radius:6px;letter-spacing:1px;">${password}</span>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:10px 0;">
                      <span style="display:block;font-size:11px;color:#94a3b8;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px;">Your Role</span>
                      <span style="display:inline-block;font-size:13px;font-weight:600;color:#6d28d9;background:#f5f3ff;padding:3px 10px;border-radius:6px;">${roleLabel}</span>
                    </td>
                  </tr>
                </table>
              </div>

              <!-- CTA Button -->
              <div style="text-align:center;margin-bottom:28px;">
                <a href="${loginLink}" style="display:inline-block;padding:13px 32px;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;border-radius:12px;letter-spacing:0.3px;">
                  Log In to Your Account →
                </a>
              </div>

              <!-- Security note -->
              <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:16px;">
                <p style="margin:0;color:#92400e;font-size:12.5px;line-height:1.6;">
                  <strong>🔒 Security tip:</strong> Please change your password after your first login. Do not share your credentials with anyone.
                </p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;padding:20px 40px;border-top:1px solid #e2e8f0;text-align:center;">
              <p style="margin:0;color:#94a3b8;font-size:12px;">
                This email was sent by the MSWDO Census System · <a href="${loginLink}" style="color:#6366f1;text-decoration:none;">Open App</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

    await transporter.sendMail({
      from: smtpFrom,
      to,
      subject: `Your MSWDO Census Account — ${name}`,
      html,
    });

    return NextResponse.json({ success: true, message: `Welcome email sent to ${to}` });
  } catch (err) {
    console.error('[send-email] Error:', err);
    const message = err instanceof Error ? err.message : 'Failed to send email';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
