import re

with open('faq_out.txt', 'r', encoding='utf-8') as f:
    new_faqs = f.read()

with open('apps/frontend/src/app/info/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace padding
content = content.replace('<div className="flex-1 overflow-y-auto px-4 py-6">', '<div className="flex-1 overflow-y-auto px-4 py-6 pb-32">')

# Replace FAQ section
pattern = r'(<div className="space-y-3">\n\s*<h3.*?Общие вопросы</h3>\n.*?)(?=^\s*</div>\n\s*</div>\n\s*\)}|^            </div>\n          \)}\n\n          \{/\* TAB: FAIRNESS \*/)'
match = re.search(pattern, content, flags=re.DOTALL | re.MULTILINE)
if match:
    replacement = '<div className="space-y-3">\n' + new_faqs
    content = content[:match.start()] + replacement + content[match.end():]
    with open('apps/frontend/src/app/info/page.tsx', 'w', encoding='utf-8') as f:
        f.write(content)
    print('Successfully patched page.tsx')
else:
    print('Could not find FAQ section to patch')
