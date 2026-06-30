const fs = require('fs');

function patchFile(file) {
  if (fs.existsSync(file)) {
    let code = fs.readFileSync(file, 'utf8');
    // production minified signature: function q(c,a,g){
    code = code.replace(/function q\(c,a,g\)\{/, 'function q(c,a,g){if(c===undefined){console.error(`UNDEFINED COMPONENT! Props keys: ${Object.keys(a||{}).join(\',\')}`); console.trace();} ');
    // development signature: function jsxWithValidation(type, props, key, isStaticChildren, source, self) {
    code = code.replace(/function jsxWithValidation\(type, props, key, isStaticChildren, source, self\) \{/, 'function jsxWithValidation(type, props, key, isStaticChildren, source, self) { if (type === undefined) { console.error(`UNDEFINED COMPONENT! Props keys: ${Object.keys(props||{}).join(\',\')}`); console.trace(); } ');
    fs.writeFileSync(file, code);
    console.log('Patched', file);
  }
}

patchFile('node_modules/next/dist/compiled/react/cjs/react-jsx-runtime.production.min.js');
patchFile('node_modules/next/dist/compiled/react/cjs/react-jsx-dev-runtime.development.js');
