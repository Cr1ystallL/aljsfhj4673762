import ast
import os

def extract_strings_from_ast(node, strings):
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        strings.append(node.value)
    elif isinstance(node, ast.JoinedStr):
        for var in node.values:
            extract_strings_from_ast(var, strings)
    elif hasattr(node, '_fields'):
        for field in node._fields:
            extract_strings_from_ast(getattr(node, field), strings)
    elif isinstance(node, list):
        for item in node:
            extract_strings_from_ast(item, strings)

def get_messages_from_file(filepath):
    messages = []
    try:
        with open(filepath, 'r', encoding='utf-8-sig') as f:
            content = f.read()
        tree = ast.parse(content)
        
        for node in ast.walk(tree):
            is_message_call = False
            # Check call arg texts
            if isinstance(node, ast.Call):
                if isinstance(node.func, ast.Attribute):
                    if node.func.attr in ('answer', 'edit_text', 'send_message', 'send_photo', 'answer_photo', 'reply', 'answer_document'):
                        is_message_call = True
                
                if is_message_call:
                    call_strings = []
                    for arg in node.args:
                        extract_strings_from_ast(arg, call_strings)
                    for kw in node.keywords:
                        if kw.arg in ('text', 'caption'):
                            extract_strings_from_ast(kw.value, call_strings)
                    
                    if call_strings:
                        messages.append(''.join(call_strings))
                        
            # Check string variable assignments usually representing text messages
            elif isinstance(node, ast.Assign):
                for target in node.targets:
                    if isinstance(target, ast.Name):
                        if any(keyword in target.id for keyword in ('text', 'info', 'message', 'msg')):
                            call_strings = []
                            extract_strings_from_ast(node.value, call_strings)
                            if call_strings:
                                messages.append(''.join(call_strings))
    except Exception as e:
        print(f"Error parsing {filepath}: {e}")
    return messages

def main():
    root_dir = r"d:\Codes\4\112\nehuy\MacvBet"
    dirs_to_check = ['handlers', 'logic', 'utils', 'keyboards']
    all_messages = set()
    
    for d in dirs_to_check:
        dir_path = os.path.join(root_dir, d)
        if not os.path.exists(dir_path):
            continue
        for root, dirs, files in os.walk(dir_path):
            for file in files:
                if file.endswith('.py'):
                    filepath = os.path.join(root, file)
                    msgs = get_messages_from_file(filepath)
                    for m in msgs:
                        m_clean = m.strip()
                        if len(m_clean) > 2:
                            all_messages.add(m_clean)
                            
    # Extract keyboard strings
    for d in ['keyboards', 'handlers']:
        dir_path = os.path.join(root_dir, d)
        if not os.path.exists(dir_path):
            continue
        for root, dirs, files in os.walk(dir_path):
            for file in files:
                if file.endswith('.py'):
                    try:
                        with open(os.path.join(root, file), 'r', encoding='utf-8-sig') as f:
                            tree = ast.parse(f.read())
                            for node in ast.walk(tree):
                                if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
                                    if node.func.id in ('InlineKeyboardButton', 'KeyboardButton', 'ReplyKeyboardMarkup'):
                                        for kw in node.keywords:
                                            if kw.arg == 'text':
                                                strs = []
                                                extract_strings_from_ast(kw.value, strs)
                                                if strs:
                                                    v = ''.join(strs).strip()
                                                    if len(v) > 1:
                                                        all_messages.add(v)
                    except:
                        pass
                            
    output_file = os.path.join(root_dir, "bot_messages.txt")
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write("=== ВСЕ СООБЩЕНИЯ И ТЕКСТЫ БОТА ===\n\n")
        for m in sorted(all_messages):
            # Clean up newlines for better readability
            m_formatted = m.replace('\n', '\n  ')
            f.write(f"- {m_formatted}\n\n")
            
    print(f"Extraction complete. Found {len(all_messages)} unique message parts.")
    print(f"File saved to {output_file}")

if __name__ == '__main__':
    main()
