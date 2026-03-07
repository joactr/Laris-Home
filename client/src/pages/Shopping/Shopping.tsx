import { useState, useEffect, useCallback } from 'react';
import { api } from '../../api/client';
import { useAuthStore } from '../../store/auth';
import { t } from '../../i18n';

type Filter = 'all' | 'active' | 'completed';

export default function Shopping() {
    const [lists, setLists] = useState<any[]>([]);
    const [activeListId, setActiveListId] = useState<string>('');
    const [items, setItems] = useState<any[]>([]);
    const [filter, setFilter] = useState<Filter>('all');
    const [newItem, setNewItem] = useState('');
    const [newQty, setNewQty] = useState('');
    const [loading, setLoading] = useState(true);
    const [showNewList, setShowNewList] = useState(false);
    const [newListName, setNewListName] = useState('');
    const user = useAuthStore((s) => s.user);

    const loadLists = useCallback(async () => {
        const l = await api.shopping.getLists();
        setLists(l);
        if (!activeListId && l.length) setActiveListId(l[0].id);
    }, [activeListId]);

    const loadItems = useCallback(async () => {
        if (!activeListId) return;
        const i = await api.shopping.getItems(activeListId);
        setItems(i);
    }, [activeListId]);

    useEffect(() => { loadLists().finally(() => setLoading(false)); }, []);
    useEffect(() => { if (activeListId) loadItems(); }, [activeListId]);

    const addItem = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newItem.trim()) return;
        await api.shopping.addItem(activeListId, {
            name: newItem.trim(),
            quantity: newQty ? parseFloat(newQty) : undefined,
        });
        setNewItem(''); setNewQty('');
        loadItems();
    };

    const toggle = async (id: string) => {
        await api.shopping.toggleComplete(id);
        loadItems();
    };

    const remove = async (id: string) => {
        await api.shopping.deleteItem(id);
        loadItems();
    };

    const reAdd = async (id: string) => {
        await api.shopping.reAddItem(id);
        loadItems();
    };

    const createList = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newListName.trim()) return;
        const l = await api.shopping.createList(newListName.trim());
        setNewListName(''); setShowNewList(false);
        await loadLists();
        setActiveListId(l.id);
    };

    const deleteList = async (id: string) => {
        if (lists.length <= 1) {
            alert('No puedes eliminar la única lista que tienes.');
            return;
        }
        if (!window.confirm('¿Eliminar esta lista y todos sus ítems?')) return;
        await api.shopping.deleteList(id);
        const l = await api.shopping.getLists();
        setLists(l);
        if (l.length > 0) {
            setActiveListId(l[0].id);
        } else {
            setActiveListId('');
        }
    };

    const filtered = items.filter(i =>
        filter === 'all' ? true : filter === 'active' ? !i.is_completed : i.is_completed
    );

    if (loading) return <div className="loading-center"><div className="spinner" /></div>;

    return (
        <div className="page">
            <div className="page-header">
                <div>
                    <div className="page-title">{t('page.shopping')}</div>
                    <div className="page-subtitle">{items.filter(i => !i.is_completed).length} {t('shopping.itemsRemaining')}</div>
                </div>
                <button className="btn btn-secondary btn-sm" onClick={() => setShowNewList(true)} id="shopping-new-list">{t('shopping.newList')}</button>
            </div>

            {/* New list dialog */}
            {showNewList && (
                <div className="modal-overlay" onClick={() => setShowNewList(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <span className="modal-title">{t('shopping.newListTitle')}</span>
                            <button className="modal-close" onClick={() => setShowNewList(false)}>×</button>
                        </div>
                        <form onSubmit={createList}>
                            <div className="form-group">
                                <label className="label">{t('shopping.listNameLabel')}</label>
                                <input id="new-list-name" className="input" placeholder={t('shopping.listNamePlaceholder')} value={newListName} onChange={(e) => setNewListName(e.target.value)} autoFocus />
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowNewList(false)}>{t('common.cancel')}</button>
                                <button id="create-list-submit" type="submit" className="btn btn-primary">{t('common.create')}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* List tabs */}
            <div className="list-tabs" style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8, flexWrap: 'wrap' }}>
                {lists.map(l => (
                    <div 
                        key={l.id} 
                        className={`list-tab ${l.id === activeListId ? 'active' : ''}`}
                        onClick={() => setActiveListId(l.id)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
                    >
                        <span>{l.name}</span>
                        {l.id === activeListId && lists.length > 1 && (
                            <button 
                                onClick={(e) => { e.stopPropagation(); deleteList(l.id); }}
                                style={{ background: 'transparent', border: 'none', color: 'inherit', opacity: 0.7, padding: 0, cursor: 'pointer', fontSize: 16, lineHeight: 1 }}
                                title="Eliminar lista"
                            >
                                ×
                            </button>
                        )}
                    </div>
                ))}
            </div>

            {/* Add item bar */}
            <form onSubmit={addItem} className="add-item-bar">
                <input
                    id="add-item-name"
                    className="input"
                    placeholder={t('shopping.addItemPlaceholder')}
                    value={newItem}
                    onChange={(e) => setNewItem(e.target.value)}
                />
                <input
                    id="add-item-qty"
                    className="input"
                    placeholder={t('shopping.qtyLabel')}
                    value={newQty}
                    onChange={(e) => setNewQty(e.target.value)}
                    style={{ width: 72, flexShrink: 0 }}
                    type="number"
                    min="0"
                />
                <button id="add-item-submit" type="submit" className="btn btn-primary" style={{ flexShrink: 0 }}>{t('common.add')}</button>
            </form>

            {/* Filter tabs */}
            <div className="filter-tabs">
                {(['all', 'active', 'completed'] as Filter[]).map(f => (
                    <button key={f} className={`filter-tab ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
                        {f === 'all' ? t('shopping.filterAll') : f === 'active' ? t('shopping.filterActive') : t('shopping.filterCompleted')}
                    </button>
                ))}
            </div>

            {/* Item list */}
            <div className="card">
                {filtered.length === 0 && <p className="empty-state"><span className="icon">🛒</span><br />{t('shopping.noItems')}</p>}
                {filtered.map(item => (
                    <div key={item.id} className="item-row">
                        <button
                            className={`item-check ${item.is_completed ? 'checked' : ''}`}
                            onClick={() => toggle(item.id)}
                            id={`check-item-${item.id}`}
                        >
                            {item.is_completed && <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><polyline points="2,6 5,9 10,3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>}
                        </button>
                        <div className="item-info">
                            <div className={`item-name ${item.is_completed ? 'completed' : ''}`}>{item.name}</div>
                            <div className="item-meta">
                                {item.quantity && `${item.quantity}${item.unit ? ' ' + item.unit : ''} · `}
                                {item.category && `${item.category} · `}
                                {item.added_by_name && (
                                    <>{t('shopping.addedBy')} <span className="avatar" style={{ background: item.added_by_color }}>{item.added_by_name[0]}</span></>
                                )}
                            </div>
                        </div>
                        {item.is_completed && (
                            <button className="btn btn-ghost btn-sm" onClick={() => reAdd(item.id)} title="Re-add">↩</button>
                        )}
                        <button className="btn btn-ghost btn-sm" onClick={() => remove(item.id)} style={{ color: 'var(--red)' }}>✕</button>
                    </div>
                ))}
            </div>
        </div>
    );
}
