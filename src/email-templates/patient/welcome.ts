import { baseTemplate } from '../layouts/base';

export interface PatientWelcomeProps {
  name: string;
  doctorName: string;
  hasProtocol: boolean;
  protocolUrl?: string;
  baseUrl: string;
}

export const createPatientWelcomeEmail = ({
  name,
  doctorName,
  hasProtocol,
  protocolUrl,
  baseUrl
}: PatientWelcomeProps) => {
  const content = `
    <div>
      <p>Welcome to Zuzz</p>
      
      <p>
        Dr. ${doctorName} will help you with your treatment
        ${hasProtocol ? `<br>Your protocol is ready →` : ''}
      </p>
      
      ${hasProtocol ? `
        <p><a href="${protocolUrl}">Start treatment</a></p>
      ` : ''}
      
      <p>
        Next steps:<br>
        • Complete your profile<br>
        • Review your protocol<br>
        • Set up reminders<br>
        • Check educational content
      </p>
      
      <p><a href="${baseUrl}/dashboard">Go to dashboard →</a></p>
    </div>
  `;

  return baseTemplate({
    content,
    clinicName: 'Zuzz'
  });
}; 