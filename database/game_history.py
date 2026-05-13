"""
Система хранения истории игр
"""
from typing import Dict, List, Any
from datetime import datetime


class GameHistory:
    """Класс для хранения истории игр"""
    
    def __init__(self):
        # {game_id: {game_type, user_id, amount, result, details, timestamp}}
        self._history: Dict[str, Dict[str, Any]] = {}
    
    def save_game(self, game_id: str, game_type: str, user_id: int, 
                  amount: float, result: str, details: Dict[str, Any]) -> None:
        """Сохранить игру в историю"""
        self._history[game_id] = {
            'game_type': game_type,
            'user_id': user_id,
            'amount': amount,
            'result': result,  # 'win', 'loss'
            'details': details,
            'timestamp': datetime.now()
        }
    
    def get_game(self, game_id: str) -> Dict[str, Any]:
        """Получить информацию об игре"""
        return self._history.get(game_id)
    
    def game_exists(self, game_id: str) -> bool:
        """Проверить существование игры"""
        return game_id in self._history


# Глобальный экземпляр истории
game_history = GameHistory()
