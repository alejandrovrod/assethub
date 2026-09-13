import { render } from '@react-email/render';
import React from 'react';

const run = async () => {
  const html = await render(
    React.createElement('div', { dangerouslySetInnerHTML: { __html: '<p>Hello <b>World</b></p>' } })
  );
  console.log(html);
}
run();
