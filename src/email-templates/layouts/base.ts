import { colors, fonts, spacing, commonStyles } from '../utils/styles';
import { BaseTemplateProps } from '../types';

export function baseTemplate({
  content,
  clinicName,
  clinicLogo,
  doctorName
}: BaseTemplateProps): string {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${clinicName}</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #ffffff; line-height: 1.6; text-transform: uppercase;">
      <div style="max-width: 600px; margin: 40px auto; padding: 0 20px; background-color: #ffffff;">
        <!-- Main Content -->
        ${content}

        <!-- Footer -->
        <div style="margin-top: 32px; padding-top: 32px; border-top: 1px solid #eee; color: #666;">
          <p style="margin: 0; font-size: 12px; color: #666;">
            Enviado por ${clinicName}
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
} 