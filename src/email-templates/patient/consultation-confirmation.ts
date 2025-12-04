import { baseTemplate } from '../layouts/base';
import { ConsultationConfirmationEmailProps } from '../types';

export const createConsultationConfirmationEmail = ({
  patientName,
  doctorName,
  specialty,
  whatsapp,
  message,
}: ConsultationConfirmationEmailProps) => {
  const content = `
    <div>
      <p>Thank you for your request</p>
      
      <p>${message}</p>
      
      <p>
        Dr. ${doctorName}
        ${specialty ? `<br>${specialty}` : ''}
        <br>We'll contact you at ${whatsapp} →
      </p>
    </div>
  `;

  return baseTemplate({
    content,
    clinicName: 'htps.io',
    doctorName
  });
} 