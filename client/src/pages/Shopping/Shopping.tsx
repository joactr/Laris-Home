import { useState, useEffect, useCallback } from 'react';
import { api } from '../../api/client';
import { useAuthStore } from '../../store/auth';
import { t } from '../../i18n';
import { useVoiceStore } from '../../store/voice';
import ConfirmModal from '../../components/ConfirmModal';
import StatusModal from '../../components/StatusModal';
import { useOfflineStore } from '../../store/offline';

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
    
    // Modal states
    const [pendingItems, setPendingItems] = useState<any[] | null>(null);
    const [voiceMessage, setVoiceMessage] = useState<string>('');
    const [confirmDeleteList, setConfirmDeleteList] = useState<string | null>(null);
    const [voiceTranscript, setVoiceTranscript] = useState('');
    const [voiceFallback, setVoiceFallback] = useState<{ message: string; transcript: string } | null>(null);
    const isOffline = useOfflineStore((s) => s.isOffline);
    const pendingCount = useOfflineStore((s) => s.pendingCount);

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

    const handleDeleteList = async () => {
        if (!confirmDeleteList) return;
        await api.shopping.deleteList(confirmDeleteList);
        setConfirmDeleteList(null);
        const l = await api.shopping.getLists();
        setLists(l);
        if (l.length > 0) {
            setActiveListId(l[0].id);
        } else {
            setActiveListId('');
        }
    };

    const handleVoiceResult = useCallback(async (finalText: string) => {
        try {
            const res = await api.voice.processShopping(finalText);
            setVoiceTranscript(res.transcript || finalText);
            if (res.status === 'needs_review' && res.items && res.items.length) {
                setPendingItems(res.items);
                setVoiceMessage(res.message || t('shopping.detectedItems'));
                setVoiceFallback(null);
            } else {
                setVoiceFallback({
                    message: res.message || t('shopping.voiceManualHint'),
                    transcript: res.transcript || finalText,
                });
            }
        } catch (err: any) {
            setVoiceFallback({
                message: err.message || t('common.error'),
                transcript: finalText,
            });
        }
    }, [activeListId]);

    useEffect(() => {
        const voiceStore = useVoiceStore.getState();
        voiceStore.register(handleVoiceResult, t('voice.placeholder.shopping'));
        return () => voiceStore.unregister();
    }, [handleVoiceResult]);

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
                <button 
                    className="btn btn-secondary btn-sm touch-target" 
                    onClick={() => setShowNewList(true)} 
                    id="shopping-new-list"
                    aria-label={t('shopping.newList')}
                >
                    {t('shopping.newList')}
                </button>
            </div>

            {(isOffline || pendingCount > 0) && (
                <div className="card" style={{ marginBottom: 16, color: 'var(--text-secondary)' }}>
                    {isOffline ? 'Sin conexión. Los cambios en compras se guardarán y se sincronizarán después.' : 'Reconectado. Sincronizando cambios pendientes de compras.'}
                </div>
            )}

            {/* New list dialog */}
            {showNewList && (
                <div className="modal-overlay" onClick={() => setShowNewList(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <span className="modal-title">{t('shopping.newListTitle')}</span>
                            <button className="modal-close touch-target" onClick={() => setShowNewList(false)} aria-label={t('common.close')}>×</button>
                        </div>
                        <form onSubmit={createList}>
                            <div className="form-group">
                                <label className="label" htmlFor="new-list-name">{t('shopping.listNameLabel')}</label>
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

            {/* Voice Confirmation Modal */}
            {pendingItems && (
                <div className="modal-overlay" onClick={() => setPendingItems(null)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <span className="modal-title">{t('shopping.confirmItems')}</span>
                            <button className="modal-close touch-target" onClick={() => setPendingItems(null)} aria-label={t('common.close')}>×</button>
                        </div>
                        <div style={{ padding: '0 0 16px' }}>
                            <p style={{ marginBottom: 16 }}>{voiceMessage}</p>
                            {voiceTranscript && (
                                <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: 10, marginBottom: 16, color: 'var(--text-secondary)', fontSize: 13 }}>
                                    <strong>{t('voice.transcriptLabel')}:</strong> {voiceTranscript}
                                </div>
                            )}
                            <ul style={{ background: 'var(--bg-tertiary)', padding: "12px 24px", borderRadius: 8, marginBottom: 16, listStyle: 'none' }}>
                                {pendingItems.map((pi, idx) => (
                                    <li key={idx} style={{ marginBottom: 4 }}>
                                        <strong>{pi.quantity}x</strong> {pi.name}
                                    </li>
                                ))}
                            </ul>
                            <div className="modal-actions">
                                <button type="button" className="btn btn-secondary" onClick={() => setPendingItems(null)}>{t('common.cancel')}</button>
                                <button type="button" className="btn btn-primary" onClick={async () => {
                                    setLoading(true);
                                    for (const item of pendingItems) {
                                        await api.shopping.addItem(activeListId, { name: item.name, quantity: item.quantity });
                                    }
                                    setPendingItems(null);
                                    loadItems();
                                    setLoading(false);
                                }}>{t('shopping.confirmBtn')}</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete List Confirmation */}
            <ConfirmModal
                isOpen={!!confirmDeleteList}
                title={t('common.delete')}
                message={t('shopping.deleteListConfirm')}
                onConfirm={handleDeleteList}
                onCancel={() => setConfirmDeleteList(null)}
                isDanger
            />

            {/* List tabs */}
            <div className="h-scroll-wrapper" style={{ marginBottom: 18 }}>
                <div className="h-scroll-container">
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
                                    onClick={(e) => { e.stopPropagation(); setConfirmDeleteList(l.id); }}
                                    style={{ background: 'transparent', border: 'none', color: 'inherit', opacity: 0.7, padding: '4px', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}
                                    title={t('common.delete')}
                                    aria-label={`${t('common.delete')} ${l.name}`}
                                >
                                    ×
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Add item bar - Responsive optimization */}
            <form onSubmit={addItem} className="add-item-bar" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ flex: '1 1 100%', minWidth: 200 }}>
                   <input
                        id="add-item-name"
                        className="input"
                        placeholder={t('shopping.addItemPlaceholder')}
                        value={newItem}
                        onChange={(e) => setNewItem(e.target.value)}
                        aria-label={t('shopping.addItemPlaceholder')}
                    />
                </div>
                <div style={{ flex: '1 1 60px', display: 'flex', gap: 8 }}>
                    <input
                        id="add-item-qty"
                        className="input"
                        placeholder={t('shopping.qtyLabel')}
                        value={newQty}
                        onChange={(e) => setNewQty(e.target.value)}
                        style={{ width: 72 }}
                        type="number"
                        min="0"
                        aria-label={t('shopping.qtyLabel')}
                    />
                    <button id="add-item-submit" type="submit" className="btn btn-primary touch-target" style={{ flex: 1 }}>{t('common.add')}</button>
                </div>
            </form>

            {/* Filter tabs */}
            <div className="filter-tabs">
                {(['all', 'active', 'completed'] as Filter[]).map(f => (
                    <button 
                        key={f} 
                        className={`filter-tab ${filter === f ? 'active' : ''} touch-target`} 
                        onClick={() => setFilter(f)}
                    >
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
                            className={`item-check ${item.is_completed ? 'checked' : ''} touch-target`}
                            onClick={() => toggle(item.id)}
                            id={`check-item-${item.id}`}
                            aria-label={item.is_completed ? t('common.unmark') : t('common.mark')}
                        >
                            {item.is_completed && <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><polyline points="2,6 5,9 10,3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>}
                        </button>
                        <div className="item-info">
                            <div className={`item-name ${item.is_completed ? 'completed' : ''}`}>{item.name}</div>
                            <div className="item-meta">
                                {item.quantity && `${item.quantity}${item.unit ? ' ' + item.unit : ''} · `}
                                {item.category && `${item.category} · `}
                                {item.pending_sync && `${t('shopping.offlinePending')} · `}
                                {item.sync_error && `${t('shopping.offlineError')} · `}
                                {item.added_by_name && (
                                    <>{t('shopping.addedBy')} <span className="avatar" style={{ background: item.added_by_color }}>{item.added_by_name[0]}</span></>
                                )}
                            </div>
                        </div>
                        {item.is_completed && (
                            <button className="btn btn-ghost btn-sm touch-target" onClick={() => reAdd(item.id)} title="Re-add" aria-label={t('common.readd', 'Volver a añadir')}>↩</button>
                        )}
                        <button className="btn btn-ghost btn-sm touch-target" onClick={() => remove(item.id)} style={{ color: 'var(--red)' }} aria-label={t('common.delete')}>✕</button>
                    </div>
                ))}
            </div>

            <StatusModal
                isOpen={!!voiceFallback}
                title={t('shopping.voiceFallbackTitle')}
                message={voiceFallback?.message || ''}
                details={voiceFallback?.transcript ? `${t('voice.transcriptLabel')}: ${voiceFallback.transcript}` : null}
                primaryText={t('common.retry')}
                secondaryText={t('common.close')}
                onPrimary={voiceFallback?.transcript ? () => handleVoiceResult(voiceFallback.transcript) : undefined}
                onSecondary={() => setVoiceFallback(null)}
                onClose={() => setVoiceFallback(null)}
            />
        </div>
    );
}
