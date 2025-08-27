import { baseTemplate } from '../layouts/base';
import { ConsultationRequestEmailProps } from '../types';

export const createConsultationRequestEmail = ({
  patientName,
  patientEmail,
  patientPhone,
  patientAge,
  specialty,
  message,
  referrerName,
  referralCode,
  doctorName
}: ConsultationRequestEmailProps) => {
  const content = `
    <div>
      <p>New consultation request</p>
      
      <p>
        ${patientName}<br>
        ${patientEmail}<br>
        ${patientPhone}
        ${patientAge ? `<br>${patientAge} years` : ''}
        ${specialty ? `<br>${specialty}` : ''}
        ${message ? `<br>${message}` : ''}
        ${referralCode ? `<br>Referred by ${referrerName || 'Code: ' + referralCode}` : ''}
      </p>
      
      <p>Contact the patient to schedule a consultation →</p>
    </div>
  `;

  return baseTemplate({
    content,
    clinicName: 'Zuzz',
    doctorName
  });
} 