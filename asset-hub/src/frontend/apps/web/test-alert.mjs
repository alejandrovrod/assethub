import { render } from '@react-email/render';
import React from 'react';
import { AlertEmailTemplate } from './src/emails/AlertEmailTemplate.tsx';
import fs from 'fs';

const run = async () => {
  const html = await render(React.createElement(AlertEmailTemplate, { rawContent: '' }));
  fs.writeFileSync('test-alert-output.html', html);
  console.log('Done');
};
run();
