// @ts-nocheck
import { Heading, Text, Section } from '@react-email/components';
import { AssetHubEmailLayout } from './AssetHubEmailLayout';

interface Props {
  rawContent?: string;
}

export const SuccessEmailTemplate = ({ rawContent = 'Mensaje de éxito' }: Props) => {
  return (
    <AssetHubEmailLayout previewText="{{subject}}">
      <Section style={successBanner}>
        <Text style={successText}>OPERACIÓN COMPLETADA</Text>
      </Section>
      <Heading as="h2" style={heading}>
        {'{{subject}}'}
      </Heading>

      <Text style={paragraph}>
        {rawContent}
      </Text>
    </AssetHubEmailLayout>
  );
};

const successBanner = {
  backgroundColor: '#10b981',
  padding: '12px',
  borderRadius: '8px',
  marginBottom: '24px',
  textAlign: 'center' as const,
};

const successText = {
  color: '#ffffff',
  fontWeight: 'bold',
  fontSize: '14px',
  margin: 0,
  letterSpacing: '1px',
};

const heading = {
  fontSize: '22px',
  fontWeight: 'bold',
  color: '#1f2937',
  marginBottom: '16px',
};

const paragraph = {
  fontSize: '16px',
  lineHeight: '24px',
  color: '#4b5563',
  marginBottom: '16px',
};
