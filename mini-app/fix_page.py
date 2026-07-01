import re

with open('apps/frontend/src/app/info/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix literal \n
content = content.replace('\\n                <Accordion', '\n                <Accordion')

# Replace Blackjack with Hi Lo
old_bj = 'question="🃏 Как играть в Blackjack?" \n                  answer="Соберите карты с суммой очков ближе к 21, чем у дилера, но не превышайте 21. Валет, Дама, Король = 10 очков. Туз = 1 или 11."'
new_hilo = 'question="🃏 Как играть в Hi Lo?" \n                  answer="В Hi Lo вам предстоит угадать, будет ли следующая карта старше (Hi) или младше (Lo) текущей. Чем меньше вероятность события, тем выше множитель выигрыша. Вы можете забрать выигрыш после любого успешного шага!"'
content = content.replace(old_bj, new_hilo)

with open('apps/frontend/src/app/info/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Fixed literal newlines and replaced Blackjack with Hi Lo in page.tsx')
