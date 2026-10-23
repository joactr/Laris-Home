import { useState, useEffect, useCallback } from 'react';
import { api } from '../../api';
import { t } from '../../i18n';
import type {
  BuyAgainSuggestion,
  ShoppingDuplicatePreview,
  VoiceShoppingItem,
} from '../../../../shared/contracts';
import { useVoiceStore } from '../../store/voice';
import ConfirmModal from '../../components/ConfirmModal';
import StatusModal from '../../components/StatusModal';
import { useOfflineStore } from '../../store/offline';
import SectionHeader from '../../components/SectionHeader';
import SegmentedControl from '../../components/SegmentedControl';
import Icon from '../../components/Icon';
import './Shopping.css';

type Filter = 'all' | 'active' | 'completed';

type ShoppingList = {
  id: string;
  name: string;
};

type ShoppingItem = {
  id: string;
  name: string;
  quantity?: number | null;
  unit?: string | null;
  category?: string | null;
  is_completed: boolean;
  pending_sync?: boolean;
  sync_error?: string | null;
  added_by_name?: string | null;
  added_by_color?: string | null;
};

type DuplicatePrompt = {
  source: Record<string, unknown>;
  normalized: ShoppingDuplicatePreview['item'];
  candidate: ShoppingDuplicatePreview['candidates'][number];
};

function itemMeta(item: ShoppingItem): string {
  const parts: string[] = [
    item.quantity ? `${item.quantity}${item.unit ? ` ${item.unit}` : ''}` : t('shopUi.noQuantity'),
  ];
  if (item.category) parts.push(item.category);
  if (item.pending_sync) parts.push(t('shopping.offlinePending'));
  if (item.sync_error) parts.push(t('shopping.offlineError'));
  return parts.join(', ');
}

export default function Shopping() {
  const [lists, setLists] = useState<ShoppingList[]>([]);
  const [activeListId, setActiveListId] = useState<string>('');
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [newItem, setNewItem] = useState('');
  const [newQty, setNewQty] = useState('');
  const [loading, setLoading] = useState(true);
  const [showNewList, setShowNewList] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [pendingItems, setPendingItems] = useState<VoiceShoppingItem[] | null>(null);
  const [voiceMessage, setVoiceMessage] = useState<string>('');
  const [confirmDeleteList, setConfirmDeleteList] = useState<string | null>(null);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [voiceFallback, setVoiceFallback] = useState<{ message: string; transcript: string } | null>(null);
  const [duplicatePrompt, setDuplicatePrompt] = useState<DuplicatePrompt | null>(null);
  const [buyAgain, setBuyAgain] = useState<BuyAgainSuggestion[]>([]);
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
    const [nextItems, suggestions] = await Promise.all([
      api.shopping.getItems(activeListId),
      isOffline ? Promise.resolve([]) : api.shopping.getBuyAgain(activeListId).catch(() => []),
    ]);
    setItems(nextItems);
    setBuyAgain(suggestions);
  }, [activeListId, isOffline]);

  useEffect(() => {
    loadLists().finally(() => setLoading(false));
  }, [loadLists]);

  useEffect(() => {
    if (activeListId) {
      void loadItems();
    }
  }, [activeListId, loadItems]);

  const addSmartItem = async (data: Record<string, unknown>) => {
    if (!activeListId || !String(data.name || '').trim()) return;
    if (!isOffline) {
      const preview = await api.shopping.previewItem(activeListId, data);
      if (preview.candidates.length) {
        setDuplicatePrompt({ source: data, normalized: preview.item, candidate: preview.candidates[0] });
        return;
      }
    }
    await api.shopping.addItem(activeListId, data);
    await loadItems();
  };

  const addItem = async (e: React.FormEvent) => {
    e.preventDefault();
    await addSmartItem({
      name: newItem.trim(),
      quantity: newQty ? parseFloat(newQty) : undefined,
    });
    setNewItem('');
    setNewQty('');
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
    } catch (err: unknown) {
      setVoiceFallback({
        message: err instanceof Error ? err.message : t('common.error'),
        transcript: finalText,
      });
    }
  }, []);

  useEffect(() => {
    const voiceStore = useVoiceStore.getState();
    voiceStore.register(handleVoiceResult, t('voice.placeholder.shopping'));
    return () => voiceStore.unregister();
  }, [handleVoiceResult]);

  const activeList = lists.find((list) => list.id === activeListId);
  const activeItems = items.filter((item) => !item.is_completed);
  const doneItems = items.filter((item) => item.is_completed);
  const showActive = filter !== 'completed' ? activeItems : [];
  const showDone = filter !== 'active' ? doneItems : [];
  const isEmpty = showActive.length === 0 && showDone.length === 0;
  const remainingCount = activeItems.length;

  const groups: Array<{ key: string; title: string | null; items: ShoppingItem[]; done: boolean }> = [
    { key: 'active', title: null, items: showActive, done: false },
    { key: 'done', title: t('shopUi.bought'), items: showDone, done: true },
  ].filter((group) => group.items.length > 0);

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
        title={t('page.shopping')}
        subtitle={remainingCount === 1 ? t('shopUi.pendingOne', remainingCount) : t('shopUi.pendingMany', remainingCount)}
      />

      {lists.length === 0 ? (
        <p className="empty-state">
          {t('shopping.createListFirst')}{' '}
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowNewList(true)}>
            {t('shopping.newListTitle')}
          </button>
        </p>
      ) : (
        <>
          <div className="shopping-lists" role="tablist" aria-label={t('page.shopping')}>
            {lists.map((list) => (
              <button
                key={list.id}
                type="button"
                role="tab"
                aria-selected={list.id === activeListId}
                className="shopping-list-tab"
                onClick={() => setActiveListId(list.id)}
              >
                {list.name}
              </button>
            ))}
            <button type="button" className="shopping-create" onClick={() => setShowNewList(true)}>
              <Icon name="plus" size={16} />
              {t('shopUi.newList')}
            </button>
            {activeList && lists.length > 1 ? (
              <button
                type="button"
                className="icon-button"
                onClick={() => setConfirmDeleteList(activeList.id)}
                aria-label={t('shopUi.deleteListOf', activeList.name)}
              >
                <Icon name="trash" size={18} />
              </button>
            ) : null}
          </div>

          {(isOffline || pendingCount > 0) && (
            <p className="shopping-sync">
              <span className={`status-dot ${isOffline ? 'offline' : 'syncing'}`} aria-hidden="true" />
              {isOffline ? t('shopUi.offlineMode') : pendingCount === 1 ? t('shopUi.pendingChangesOne', pendingCount) : t('shopUi.pendingChangesMany', pendingCount)}
            </p>
          )}

          <form onSubmit={addItem} className="shopping-add">
            <input
              id="add-item-name"
              className="input shopping-add-name"
              placeholder={t('shopping.addItemPlaceholder')}
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              aria-label={t('shopping.addItemPlaceholder')}
            />
            <input
              id="add-item-qty"
              className="input"
              placeholder={t('shopping.qtyLabel')}
              value={newQty}
              onChange={(e) => setNewQty(e.target.value)}
              type="number"
              min="0"
              inputMode="decimal"
              aria-label={t('shopping.qtyLabel')}
            />
            <button id="add-item-submit" type="submit" className="btn btn-primary">
              {t('shopUi.addItemBtn')}
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
            className="shopping-filter"
          />

          {buyAgain.length > 0 ? (
            <div className="shopping-suggest">
              <span>{t('shopUi.buyAgain')}</span>
              {buyAgain.slice(0, 5).map((suggestion) => (
                <button
                  key={suggestion.normalized_name || suggestion.name}
                  type="button"
                  className="shopping-suggest-btn"
                  onClick={() => void addSmartItem({
                    name: suggestion.name,
                    quantity: suggestion.quantity ? Number(suggestion.quantity) : undefined,
                    unit: suggestion.unit || undefined,
                    category: suggestion.category || undefined,
                  })}
                >
                  {suggestion.name}
                </button>
              ))}
            </div>
          ) : null}

          {groups.map((group) => (
            <section key={group.key} aria-label={group.title ?? t('shopUi.pending')}>
              {group.title && filter === 'all' && groups.length > 1 ? (
                <h2 className="shopping-bought-title">{group.title}</h2>
              ) : null}
              <ul className="shopping-list">
                {group.items.map((item) => (
                  <li key={item.id} className={`shopping-item${group.done ? ' done' : ''}`}>
                    {group.done ? (
                      <button
                        type="button"
                        className="icon-button"
                        onClick={() => void reAdd(item.id)}
                        aria-label={t('common.readd')}
                      >
                        <Icon name="undo" size={18} />
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="shopping-check"
                        id={`check-item-${item.id}`}
                        onClick={() => void toggle(item.id)}
                        aria-label={t('common.mark')}
                      >
                        <span className="shopping-check-circle" aria-hidden="true" />
                      </button>
                    )}
                    <div className="shopping-item-copy">
                      <div className="shopping-item-name">{item.name}</div>
                      <div className="shopping-item-meta">{itemMeta(item)}</div>
                    </div>
                    {item.added_by_name ? (
                      <span className="avatar" style={{ background: item.added_by_color ?? undefined }} title={item.added_by_name}>
                        {item.added_by_name[0]}
                      </span>
                    ) : null}
                    <button
                      type="button"
                      className="icon-button shopping-delete"
                      onClick={() => void remove(item.id)}
                      aria-label={`${t('common.delete')}: ${item.name}`}
                    >
                      <Icon name="trash" size={18} />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}

          {isEmpty ? (
            <p className="empty-state">
              {filter === 'completed'
                ? t('shopUi.emptyDone')
                : t('shopUi.emptyActive')}
            </p>
          ) : null}
        </>
      )}

      {showNewList ? (
        <div className="modal-overlay" onClick={() => setShowNewList(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">{t('shopping.newListTitle')}</span>
              <button type="button" className="modal-close touch-target" onClick={() => setShowNewList(false)} aria-label={t('common.close')}>
                <Icon name="close" size={18} />
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
              <button type="button" className="modal-close touch-target" onClick={() => setPendingItems(null)} aria-label={t('common.close')}>
                <Icon name="close" size={18} />
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
                      await addSmartItem({ name: item.name, quantity: item.quantity });
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

      {duplicatePrompt ? (
        <div className="modal-overlay" onClick={() => setDuplicatePrompt(null)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">{t('shopUi.duplicateTitle')}</span>
              <button type="button" className="modal-close touch-target" onClick={() => setDuplicatePrompt(null)} aria-label={t('common.close')}>
                <Icon name="close" size={18} />
              </button>
            </div>
            <div className="modal-body">
              <p>
                {t('shopUi.duplicateBody', duplicatePrompt.candidate.name, `${duplicatePrompt.normalized.quantity || 1} ${duplicatePrompt.normalized.unit || ''} ${duplicatePrompt.normalized.name}`.trim())}
              </p>
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={async () => {
                    await api.shopping.addItem(activeListId, { ...duplicatePrompt.source, allowDuplicate: true });
                    setDuplicatePrompt(null);
                    await loadItems();
                  }}
                >
                  {t('shopUi.addSeparate')}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={async () => {
                    await api.shopping.mergeItem(duplicatePrompt.candidate.id, duplicatePrompt.source, 'replace');
                    setDuplicatePrompt(null);
                    await loadItems();
                  }}
                >
                  {t('shopUi.replace')}
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={async () => {
                    await api.shopping.mergeItem(duplicatePrompt.candidate.id, duplicatePrompt.source, 'merge');
                    setDuplicatePrompt(null);
                    await loadItems();
                  }}
                >
                  {t('shopUi.merge')}
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
