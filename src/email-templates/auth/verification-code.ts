interface VerificationCodeEmailProps {
  code: string;
  clinicName?: string;
  clinicLogo?: string;
}

export function createVerificationCodeEmail({ code, clinicName = 'KRX', clinicLogo }: VerificationCodeEmailProps): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${clinicName} - Verify your email</title>
      <style>
        body {
          font-family: 'Helvetica Neue', Arial, sans-serif;
          line-height: 1.6;
          color: #000000;
          margin: 0;
          padding: 0;
          background-color: #ffffff;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
        }
        .header {
          text-align: center;
          padding: 20px 0;
        }
        .logo {
          max-width: 120px;
        }
        .content {
          background-color: #ffffff;
          padding: 30px;
          border-radius: 8px;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.08);
          color: #000000;
        }
        .verification-code {
          font-size: 32px;
          font-weight: bold;
          text-align: center;
          letter-spacing: 4px;
          margin: 30px 0;
          color: #000000;
        }
        .footer {
          text-align: center;
          font-size: 12px;
          color: #444444;
          margin-top: 30px;
        }
        .button {
          display: inline-block;
          background-color: #000000;
          color: #ffffff;
          text-decoration: none;
          padding: 12px 24px;
          border-radius: 4px;
          font-weight: 500;
          margin-top: 20px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          ${clinicLogo ? `<img src="${clinicLogo}" alt="${clinicName} Logo" class="logo">` : ''}
        </div>
        <div class="content">
          <h1>Verify your email</h1>
          <p>Thank you for signing up. To continue your registration${clinicName ? ` with ${clinicName}` : ''}, please use the verification code below:</p>
          
          <div class="verification-code">${code}</div>
          
          <p>This code is valid for 1 hour. If you did not request this code, please ignore this email.</p>
        </div>
        <div class="footer">
          <p>&copy; ${new Date().getFullYear()} ${clinicName}. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}
