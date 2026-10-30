// Replaceable, original typographic emblem. Each instance needs a unique path ID.
export function circularLogo(id, decorative = false) {
  return `<svg viewBox="0 0 200 200" ${decorative ? 'aria-hidden="true"' : 'role="img" aria-label="Human in the loop"'}><defs><path id="${id}" d="M100,24 a76,76 0 1,1 -.01,0"/></defs><text fill="currentColor" font-family="Arial, Helvetica, sans-serif" font-size="25" font-weight="600" letter-spacing="5.2"><textPath href="#${id}" textLength="474" lengthAdjust="spacing">HUMAN IN THE LOOP · </textPath></text></svg>`;
}
