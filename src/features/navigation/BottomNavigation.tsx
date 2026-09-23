import type { AppView } from '../header/Header';

interface BottomNavigationProps {
  activeView: AppView;
  onChangeView: (view: AppView) => void;
}

const NAV_ITEMS: Array<{ id: AppView; label: string; icon: string }> = [
  { id: 'today', label: '오늘', icon: '⌂' },
  { id: 'we', label: '우리', icon: '⚇' },
  { id: 'daily', label: '일새', icon: '☼' },
  { id: 'week', label: '주간', icon: '▦' },
  { id: 'operator', label: '운영', icon: '⚙' },
];

export function BottomNavigation({
  activeView,
  onChangeView,
}: BottomNavigationProps) {
  return (
    <nav className="bottom-nav" aria-label="하단 메뉴">
      {NAV_ITEMS.map((item) => (
        <button
          key={item.id}
          type="button"
          data-icon={item.icon}
          className={activeView === item.id ? 'active' : ''}
          onClick={() => onChangeView(item.id)}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}
