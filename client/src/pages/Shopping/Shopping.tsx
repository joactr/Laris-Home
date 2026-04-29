import { useState, useEffect, useCallback } from 'react';
import { api } from '../../api';
import { t } from '../../i18n';
import { useVoiceStore } from '../../store/voice';
import ConfirmModal from '../../components/ConfirmModal';
import StatusModal from '../../components/StatusModal';
import { useOfflineStore } from '../../store/offline';
import SectionHeader from '../../components/SectionHeader';
import Surface from '../../components/Surface';
import SegmentedControl from '../../components/SegmentedControl';

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
  const [pendingItems, setPendingItems] = useState<any[] | null>(null);
  const [voiceMessage, setVoiceMessage] = useState<string>('');
  const [confirmDeleteList, setConfirmDeleteList] = useState<string | null>(null);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [voiceFallback, setVoiceFallback] = useState<{ message: string; transcript: string } | null>(null);
  const isOffline = useOfflineStore((s) => s.isOffline);
  const pendingCount = useOfflineStore((s) => s.pendingCount);

  const loadLists = useCallback(async () => {
    const nextLists = await api.shopping.getLists();
    setLists(nextLists);
    if (!activeListId && nextLists.length) {
      setActiveListId(nextLists[0].id);
    }
  }, [activeListId]);

  const loadItems = useCallback(async () => {
    if (!activeListId) return;
    const nextItems = await api.shopping.getItems(activeListId);
    setItems(nextItems);
  }, [activeListId]);

  useEffect(() => {
    loadLists().finally(() => setLoading(false));
  }, [loadLists]);

  useEffect(() => {
    if (activeListId) {
      void loadItems();
    }
  }, [activeListId, loadItems]);

  const addItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItem.trim()) return;
    await api.shopping.addItem(activeListId, {
      name: newItem.trim(),
      quantity: newQty ? parseFloat(newQty) : undefined,
    });
    setNewItem('');
    setNewQty('');
    await loadItems();
  };

  const toggle = async (id: string) => {
    await api.shopping.toggleComplete(id);
    await loadItems();
  };

  const remove = async (id: string) => {
    await api.shopping.deleteItem(id);
    await loadItems();
  };

  const reAdd = async (id: string) => {
    await api.shopping.reAddItem(id);
    await loadItems();
  };

  const createList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newListName.trim()) return;
    const list = await api.shopping.createList(newListName.trim());
    setNewListName('');
    setShowNewList(false);
    await loadLists();
    setActiveListId(list.id);
  };

  const handleDeleteList = async () => {
    if (!confirmDeleteList) return;
    await api.shopping.deleteList(confirmDeleteList);
    setConfirmDeleteList(null);
    const nextLists = await api.shopping.getLists();
    setLists(nextLists);
    setActiveListId(nextLists[0]?.id || '');
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
  }, []);

  useEffect(() => {
    const voiceStore = useVoiceStore.getState();
    voiceStore.register(handleVoiceResult, t('voice.placeholder.shopping'));
    return () => voiceStore.unregister();
  }, [handleVoiceResult]);

  const filtered = items.filter((item) =>
    filter === 'all' ? true : filter === 'active' ? !item.is_completed : item.is_completed
  );

  const remainingCount = items.filter((item) => !item.is_completed).length;

  if (loading) {
    return (
      <div className="page">
        <div className="loading-center">
          <div className="spinner" />
        </div>
      </div>
    );
  }

  return (
    <div className="page page-shopping">
      <SectionHeader
        eyebrow="Compra"
        title={t('page.shopping')}
        subtitle={`${remainingCount} ${t('shopping.itemsRemaining')}`}
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setShowNewList(true)}>
            {t('shopping.newList')}
          </button>
        }
      />

      <Surface className="shopping-toolbar">
        <div className="shopping-toolbar-row">
          <div className="list-pill-row">
            {lists.map((list) => (
              <button
                key={list.id}
                type="button"
                className={`list-pill ${list.id === activeListId ? 'active' : ''}`}
                onClick={() => setActiveListId(list.id)}
              >
                <span>{list.name}</span>
                {list.id === activeListId && lists.length > 1 ? (
                  <span
                    className="list-pill-delete"
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDeleteList(list.id);
                    }}
                  >
                    ×
                  </span>
                ) : null}
              </button>
            ))}
          </div>
          {(isOffline || pendingCount > 0) && (
            <div className="inline-status">
              <span className={`status-dot ${isOffline ? 'offline' : 'syncing'}`} />
              <span>{isOffline ? 'Modo offline' : `${pendingCount} cambios pendientes`}</span>
            </div>
          )}
        </div>

        <form onSubmit={addItem} className="shopping-entry-form">
          <input
            id="add-item-name"
            className="input"
            placeholder={t('shopping.addItemPlaceholder')}
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            aria-label={t('shopping.addItemPlaceholder')}
          />
          <input
            id="add-item-qty"
            className="input shopping-qty-input"
            placeholder={t('shopping.qtyLabel')}
            value={newQty}
            onChange={(e) => setNewQty(e.target.value)}
            type="number"
            min="0"
            aria-label={t('shopping.qtyLabel')}
          />
          <button id="add-item-submit" type="submit" className="btn btn-primary">
            {t('common.add')}
          </button>
        </form>

        <SegmentedControl
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: t('shopping.filterAll') },
            { value: 'active', label: t('shopping.filterActive') },
            { value: 'completed', label: t('shopping.filterCompleted') },
          ]}
        />
      </Surface>

      <Surface title="Artículos" subtitle="Lista activa y sincronización">
        {filtered.length === 0 ? (
          <p className="empty-state compact">{t('shopping.noItems')}</p>
        ) : (
          <div className="stack-list">
            {filtered.map((item) => (
              <div key={item.id} className={`shopping-row ${item.is_completed ? 'completed' : ''}`}>
                <button
                  type="button"
                  className={`item-check ${item.is_completed ? 'checked' : ''}`}
                  onClick={() => toggle(item.id)}
                  id={`check-item-${item.id}`}
                  aria-label={item.is_completed ? t('common.unmark') : t('common.mark')}
                >
                  {item.is_completed ? (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <polyline points="2,6 5,9 10,3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  ) : null}
                </button>

                <div className="shopping-row-copy">
                  <div className={`item-name ${item.is_completed ? 'completed' : ''}`}>{item.name}</div>
                  <div className="item-meta">
                    {item.quantity ? `${item.quantity}${item.unit ? ` ${item.unit}` : ''}` : 'Sin cantidad'}
                    {item.category ? ` · ${item.category}` : ''}
                    {item.pending_sync ? ` · ${t('shopping.offlinePending')}` : ''}
                    {item.sync_error ? ` · ${t('shopping.offlineError')}` : ''}
                  </div>
                </div>

                <div className="shopping-row-actions">
                  {item.added_by_name ? (
                    <span className="avatar" style={{ background: item.added_by_color }} title={item.added_by_name}>
                      {item.added_by_name[0]}
                    </span>
                  ) : null}
                  {item.is_completed ? (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => reAdd(item.id)}>
                      ↩
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => remove(item.id)}
                    style={{ color: 'var(--red)' }}
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Surface>

      {showNewList ? (
        <div className="modal-overlay" onClick={() => setShowNewList(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">{t('shopping.newListTitle')}</span>
              <button className="modal-close touch-target" onClick={() => setShowNewList(false)} aria-label={t('common.close')}>
                ×
              </button>
            </div>
            <form onSubmit={createList}>
              <div className="form-group">
                <label className="label" htmlFor="new-list-name">
                  {t('shopping.listNameLabel')}
                </label>
                <input
                  id="new-list-name"
                  className="input"
                  placeholder={t('shopping.listNamePlaceholder')}
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowNewList(false)}>
                  {t('common.cancel')}
                </button>
                <button id="create-list-submit" type="submit" className="btn btn-primary">
                  {t('common.create')}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {pendingItems ? (
        <div className="modal-overlay" onClick={() => setPendingItems(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">{t('shopping.confirmItems')}</span>
              <button className="modal-close touch-target" onClick={() => setPendingItems(null)} aria-label={t('common.close')}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: 16 }}>{voiceMessage}</p>
              {voiceTranscript ? (
                <div className="transcript-box">
                  <strong>{t('voice.transcriptLabel')}:</strong> {voiceTranscript}
                </div>
              ) : null}
              <ul className="review-list">
                {pendingItems.map((pendingItem, idx) => (
                  <li key={idx}>
                    <strong>{pendingItem.quantity}x</strong> {pendingItem.name}
                  </li>
                ))}
              </ul>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setPendingItems(null)}>
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={async () => {
                    setLoading(true);
                    for (const item of pendingItems) {
                      await api.shopping.addItem(activeListId, { name: item.name, quantity: item.quantity });
                    }
                    setPendingItems(null);
                    await loadItems();
                    setLoading(false);
                  }}
                >
                  {t('shopping.confirmBtn')}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmModal
        isOpen={!!confirmDeleteList}
        title={t('common.delete')}
        message={t('shopping.deleteListConfirm')}
        onConfirm={handleDeleteList}
        onCancel={() => setConfirmDeleteList(null)}
        isDanger
      />

      <StatusModal
        isOpen={!!voiceFallback}
        title={t('shopping.voiceFallbackTitle')}
        message={voiceFallback?.message || ''}
        details={voiceFallback?.transcript ? `${t('voice.transcriptLabel')}: ${voiceFallback.transcript}` : null}
        onClose={() => setVoiceFallback(null)}
      />
    </div>
  );
}
