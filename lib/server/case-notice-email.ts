import nodemailer from 'nodemailer';

export interface HearingNoticeEmailParams {
  to: string;
  clientName: string;
  caseNumber: string;
  title: string;
  date: string;
  timeStart: string;
  timeEnd: string;
  venue: string;
  assignedWorker: string;
  notes?: string;
}

function getSmtpConfig() {
  const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
  const smtpPort = parseInt(process.env.SMTP_PORT || '465', 10);
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpFrom =
    process.env.SMTP_FROM || `"MSWDO Protection Desk" <${smtpUser || 'mswdo@bansalan.gov.ph'}>`;

  if (!smtpHost || !smtpUser || !smtpPass) {
    throw new Error(
      'SMTP credentials not fully configured. Please ensure SMTP_HOST, SMTP_USER, and SMTP_PASS are set in .env.local.'
    );
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

export async function sendHearingNoticeEmail(params: HearingNoticeEmailParams) {
  const { smtpFrom, transporter } = createTransport();

  const formattedDate = new Date(params.date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const subject = `OFFICIAL NOTICE OF HEARING: Case Docket ${params.caseNumber} - ${params.title}`;

  const html = `
<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1e293b;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background-color:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);">
          
          <!-- Government Header -->
          <tr>
            <td style="padding:28px 32px;background:linear-gradient(135deg, #065f46 0%, #047857 100%);color:#ffffff;text-align:center;">
              <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;opacity:0.85;">
                Republic of the Philippines &bull; Province of Davao del Sur
              </p>
              <h1 style="margin:6px 0 2px;font-size:18px;font-weight:800;letter-spacing:-0.02em;">
                MUNICIPAL SOCIAL WELFARE AND DEVELOPMENT OFFICE
              </h1>
              <p style="margin:0;font-size:12px;font-weight:600;opacity:0.9;">
                Women &amp; Children Protection Desk &bull; Social Casework Unit
              </p>
            </td>
          </tr>

          <!-- Notice Title Banner -->
          <tr>
            <td style="padding:20px 32px 10px;text-align:center;">
              <div style="display:inline-block;padding:6px 14px;background-color:#ecfdf5;border:1px solid #a7f3d0;border-radius:9999px;">
                <span style="font-size:12px;font-weight:800;color:#047857;letter-spacing:0.5px;text-transform:uppercase;">
                  Official Notice of Appearance &amp; Hearing
                </span>
              </div>
            </td>
          </tr>

          <!-- Salutation & Body -->
          <tr>
            <td style="padding:16px 32px 20px;">
              <p style="font-size:15px;line-height:1.6;margin:0 0 16px;">
                Dear <strong>${params.clientName}</strong>,
              </p>
              <p style="font-size:14px;line-height:1.6;color:#334155;margin:0 0 20px;">
                This is an official administrative notice from the MSWDO Protection Desk. You are respectfully requested to appear for the scheduled <strong>${params.title}</strong> regarding your recorded case dossier.
              </p>

              <!-- Session Details Card -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;border-radius:12px;border:1px solid #e2e8f0;margin-bottom:24px;overflow:hidden;">
                <tr>
                  <td style="padding:16px 20px;">
                    <table width="100%" cellpadding="6" cellspacing="0" style="font-size:13px;">
                      <tr>
                        <td width="35%" style="font-weight:700;color:#64748b;">Case Docket:</td>
                        <td style="font-weight:800;color:#0f172a;font-family:monospace;font-size:14px;">${params.caseNumber}</td>
                      </tr>
                      <tr>
                        <td style="font-weight:700;color:#64748b;">Hearing Agenda:</td>
                        <td style="font-weight:700;color:#065f46;">${params.title}</td>
                      </tr>
                      <tr>
                        <td style="font-weight:700;color:#64748b;">Scheduled Date:</td>
                        <td style="font-weight:700;color:#0f172a;">${formattedDate}</td>
                      </tr>
                      <tr>
                        <td style="font-weight:700;color:#64748b;">Time:</td>
                        <td style="font-weight:700;color:#0f172a;">${params.timeStart} &ndash; ${params.timeEnd}</td>
                      </tr>
                      <tr>
                        <td style="font-weight:700;color:#64748b;">Venue:</td>
                        <td style="font-weight:700;color:#0f172a;">${params.venue}</td>
                      </tr>
                      <tr>
                        <td style="font-weight:700;color:#64748b;">Assigned Officer:</td>
                        <td style="font-weight:700;color:#0f172a;">${params.assignedWorker}</td>
                      </tr>
                      ${
                        params.notes
                          ? `<tr>
                        <td style="font-weight:700;color:#64748b;vertical-align:top;">Instructions:</td>
                        <td style="font-weight:600;color:#334155;background-color:#ffffff;padding:8px 10px;border-radius:6px;border:1px solid #e2e8f0;">${params.notes}</td>
                      </tr>`
                          : ''
                      }
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Requirements Reminder -->
              <div style="background-color:#fef3c7;border-left:4px solid #f59e0b;padding:12px 16px;border-radius:0 8px 8px 0;margin-bottom:24px;">
                <p style="margin:0;font-size:12.5px;color:#92400e;line-height:1.5;">
                  <strong>Important Reminder:</strong> Please arrive at least 15 minutes before the scheduled time. Kindly bring a valid government-issued photo ID and any relevant documents supporting your case.
                </p>
              </div>

              <p style="font-size:13px;line-height:1.6;color:#475569;margin:0;">
                If you have an emergency or need to request a rescheduling, please notify your assigned social worker immediately at the Municipal Hall.
              </p>
            </td>
          </tr>

          <!-- Signature Block -->
          <tr>
            <td style="padding:10px 32px 28px;border-top:1px solid #f1f5f9;">
              <p style="margin:0 0 4px;font-size:13px;color:#64748b;">Issued on official behalf by:</p>
              <p style="margin:0;font-size:14px;font-weight:800;color:#0f172a;">${params.assignedWorker}</p>
              <p style="margin:0;font-size:12px;color:#64748b;">Social Worker / Case Mediator &bull; MSWDO Protection Desk</p>
            </td>
          </tr>

          <!-- Confidentiality Footer -->
          <tr>
            <td style="padding:20px 32px;background-color:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;">
              <p style="margin:0 0 6px;font-size:11px;color:#94a3b8;line-height:1.4;">
                CONFIDENTIALITY NOTICE: This transmission is intended strictly for the designated recipient and contains confidential social casework information protected under RA 9262 and the Data Privacy Act of 2012. Unauthorized review or dissemination is strictly prohibited.
              </p>
              <p style="margin:0;font-size:11px;font-weight:700;color:#64748b;">
                Municipal Social Welfare and Development Office &bull; Bansalan, Davao del Sur
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  const text = `
REPUBLIC OF THE PHILIPPINES
MUNICIPAL SOCIAL WELFARE AND DEVELOPMENT OFFICE (MSWDO)
Women & Children Protection Desk - Social Casework Unit

OFFICIAL NOTICE OF APPEARANCE & HEARING

Case Docket: ${params.caseNumber}
Client: ${params.clientName}
Hearing Agenda: ${params.title}
Scheduled Date: ${formattedDate}
Time: ${params.timeStart} - ${params.timeEnd}
Venue: ${params.venue}
Assigned Social Worker: ${params.assignedWorker}
${params.notes ? `Instructions: ${params.notes}\n` : ''}

Dear ${params.clientName},

You are respectfully requested to attend your scheduled session at the date, time, and venue indicated above. Please arrive 15 minutes before your schedule and bring a valid government ID and any documents relevant to your case.

Issued by: ${params.assignedWorker} (MSWDO Protection Desk)
  `.trim();

  const info = await transporter.sendMail({
    from: smtpFrom,
    to: params.to,
    subject,
    text,
    html,
  });

  return {
    messageId: info.messageId,
    recipient: params.to,
  };
}
