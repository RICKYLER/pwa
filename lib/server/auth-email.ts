import nodemailer from 'nodemailer';

function getSmtpConfig() {
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = parseInt(process.env.SMTP_PORT || '465', 10);
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpFrom = process.env.SMTP_FROM || `"MSWDO Census" <${smtpUser}>`;

  if (!smtpHost || !smtpUser || !smtpPass) {
    throw new Error('SMTP not configured. Please set SMTP_HOST, SMTP_USER, and SMTP_PASS in .env.local');
  }

  return {
    smtpHost,
    smtpPort,
    smtpUser,
    smtpPass,
    smtpFrom,
  };
}

function createTransport() {
  const { smtpHost, smtpPort, smtpUser, smtpPass, smtpFrom } = getSmtpConfig();

  return {
    smtpFrom,
    transporter: nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPass },
    }),
  };
}

export async function sendAccountSetupEmail(params: {
  to: string;
  name: string;
  roleLabel: string;
  setupLink: string;
}) {
  const { smtpFrom, transporter } = createTransport();

  const html = `
<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Set Up Your MSWDO Census Account</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Segoe UI,Arial,sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:20px;overflow:hidden;">
          <tr>
            <td style="padding:28px 36px;background:#3730a3;color:#ffffff;">
              <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:0.4px;opacity:0.8;">ACCOUNT SETUP</p>
              <h1 style="margin:10px 0 0;font-size:24px;line-height:1.2;">MSWDO Census System</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 36px;">
              <p style="margin:0 0 14px;font-size:16px;font-weight:700;">Hello, ${params.name}.</p>
              <p style="margin:0 0 18px;font-size:14px;line-height:1.7;color:#475569;">
                An administrator created your <strong>${params.roleLabel}</strong> account in the MSWDO Census System.
                For security, your password was not sent by email. Use the button below to create it.
              </p>
              <div style="text-align:center;margin:28px 0;">
                <a href="${params.setupLink}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:14px 24px;border-radius:14px;font-size:14px;font-weight:800;">
                  Set Up Password
                </a>
              </div>
              <p style="margin:0 0 18px;font-size:12.5px;line-height:1.7;color:#64748b;">
                This setup link expires in 72 hours. If the button does not work, open this link:
              </p>
              <p style="margin:0;font-size:12.5px;line-height:1.7;word-break:break-all;">
                <a href="${params.setupLink}" style="color:#4f46e5;text-decoration:none;">${params.setupLink}</a>
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
    to: params.to,
    subject: 'Set up your MSWDO Census account',
    html,
  });
}

export async function sendResidentVerificationEmail(params: {
  to: string;
  name: string;
  verifyLink: string;
}) {
  const { smtpFrom, transporter } = createTransport();

  const html = `
<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Verify Your Resident Account</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Segoe UI,Arial,sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:20px;overflow:hidden;">
          <tr>
            <td style="padding:28px 36px;background:#0f766e;color:#ffffff;">
              <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:0.4px;opacity:0.8;">EMAIL VERIFICATION</p>
              <h1 style="margin:10px 0 0;font-size:24px;line-height:1.2;">Verify Your Resident Account</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 36px;">
              <p style="margin:0 0 14px;font-size:16px;font-weight:700;">Hello, ${params.name}.</p>
              <p style="margin:0 0 18px;font-size:14px;line-height:1.7;color:#475569;">
                Thank you for creating a resident account in the MSWDO Census System.
                Please verify your email address before signing in and submitting your registration.
              </p>
              <div style="text-align:center;margin:28px 0;">
                <a href="${params.verifyLink}" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;padding:14px 24px;border-radius:14px;font-size:14px;font-weight:800;">
                  Verify Email Address
                </a>
              </div>
              <p style="margin:0 0 18px;font-size:12.5px;line-height:1.7;color:#64748b;">
                This verification link expires in 72 hours. If the button does not work, open this link:
              </p>
              <p style="margin:0;font-size:12.5px;line-height:1.7;word-break:break-all;">
                <a href="${params.verifyLink}" style="color:#0f766e;text-decoration:none;">${params.verifyLink}</a>
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
    to: params.to,
    subject: 'Verify your MSWDO resident account',
    html,
  });
}
