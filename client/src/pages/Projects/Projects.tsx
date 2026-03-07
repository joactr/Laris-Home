import { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, useParams } from 'react-router-dom';
import {
    DndContext,
    closestCorners,
    KeyboardSensor,
    MouseSensor,
    TouchSensor,
    useSensor,
    useSensors,
    DragEndEvent,
    useDroppable,
    DragOverlay,
    DragStartEvent,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { api } from '../../api/client';
import { t } from '../../i18n';

function ProjectList() {
    const [projects, setProjects] = useState<any[]>([]);
    const [showModal, setShowModal] = useState(false);
    const [form, setForm] = useState({ name: '', description: '' });
    const navigate = useNavigate();

    const load = async () => { setProjects(await api.projects.getAll()); };
    useEffect(() => { load(); }, []);

    const create = async (e: React.FormEvent) => {
        e.preventDefault();
        await api.projects.create(form);
        setShowModal(false); load();
    };

    const archive = async (id: string) => { await api.projects.update(id, { status: 'archived' }); load(); };

    const active = projects.filter(p => p.status === 'active');
    const archived = projects.filter(p => p.status === 'archived');

    return (
        <div className="page">
            <div className="page-header">
                <div className="page-title">{t('page.projects')}</div>
                <button id="projects-add" className="btn btn-primary btn-sm" onClick={() => setShowModal(true)}>{t('projects.addProject')}</button>
            </div>
            {active.map(p => (
                <div key={p.id} className="project-item" onClick={() => navigate(`/projects/${p.id}`)}>
                    <div>
                        <div className="project-name">{p.name}</div>
                        {p.description && <div className="project-meta">{p.description}</div>}
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span className="badge badge-green">{t('projects.active')}</span>
                        <button className="btn-icon" onClick={e => { e.stopPropagation(); archive(p.id); }} title={t('projects.archive')}>📦</button>
                    </div>
                </div>
            ))}
            {active.length === 0 && <p className="empty-state"><span className="icon">📋</span><br />{t('projects.noActive')}</p>}
            {archived.length > 0 && <>
                <div className="divider" />
                <div className="dash-section-title">{t('projects.archivedTitle')}</div>
                {archived.map(p => (
                    <div key={p.id} className="project-item" style={{ opacity: 0.5 }} onClick={() => navigate(`/projects/${p.id}`)}>
                        <div className="project-name">{p.name}</div>
                    </div>
                ))}
            </>}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <span className="modal-title">{t('projects.newProject')}</span>
                            <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
                        </div>
                        <form onSubmit={create}>
                            <div className="form-group">
                                <label className="label">{t('common.title')}</label>
                                <input id="project-name" className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required autoFocus />
                            </div>
                            <div className="form-group">
                                <label className="label">{t('projects.description')}</label>
                                <textarea className="input" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>{t('common.cancel')}</button>
                                <button id="project-save" type="submit" className="btn btn-primary">{t('common.create')}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

const STATUSES = ['todo', 'inProgress', 'done'] as const;

function TaskCard({ task, onClick, isOverlay, style }: { task: any, onClick?: () => void, isOverlay?: boolean, style?: React.CSSProperties }) {
    return (
        <div
            style={style}
            className={`task-card ${isOverlay ? 'dragging-overlay' : ''}`}
            onClick={onClick}
        >
            <div className="task-title">{task.title}</div>
            <div className="task-meta">
                <span className={`priority-badge priority-${task.priority}`}>{task.priority}</span>
                {task.assigned_name && (
                    <span className="avatar" style={{ background: task.assigned_color }}>{task.assigned_name[0]}</span>
                )}
                {task.due_date && <span>📅 {task.due_date.slice(0, 10)}</span>}
            </div>
        </div>
    );
}

function SortableTask({ task, onClick }: { task: any, onClick: () => void }) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: task.id });

    const style = {
        transform: CSS.Translate.toString(transform),
        transition,
        opacity: isDragging ? 0.3 : 1,
        touchAction: 'none',
    };

    return (
        <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
            <TaskCard task={task} onClick={onClick} />
        </div>
    );
}

function DroppableColumn({ status, children }: { status: string, children: React.ReactNode }) {
    const { setNodeRef } = useDroppable({ id: status });
    return (
        <div ref={setNodeRef} className="kanban-task-list">
            {children}
        </div>
    );
}

function ProjectBoard() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [tasks, setTasks] = useState<any[]>([]);
    const [members, setMembers] = useState<any[]>([]);
    const [showModal, setShowModal] = useState(false);
    const [editTask, setEditTask] = useState<any>(null);
    const [activeId, setActiveId] = useState<string | null>(null);
    const [form, setForm] = useState({ title: '', description: '', priority: 'medium', status: 'todo', assigned_user_id: '', due_date: '' });

    const sensors = useSensors(
        useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 8 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const load = async () => {
        const [t, m] = await Promise.all([api.projects.getTasks(id!), api.auth.members()]);
        setTasks(t); setMembers(m);
    };
    useEffect(() => { load(); }, [id]);

    const handleDragStart = (event: DragStartEvent) => {
        setActiveId(event.active.id.toString());
    };

    const handleDragEnd = async (event: DragEndEvent) => {
        setActiveId(null);
        const { active, over } = event;
        if (!over) return;

        const activeTask = tasks.find(t => t.id === active.id);
        const overId = over.id.toString();

        let newStatus: typeof STATUSES[number] | null = null;
        if (STATUSES.includes(overId as any)) {
            newStatus = overId as any;
        } else {
            const overTask = tasks.find(t => t.id === over.id);
            if (overTask) newStatus = overTask.status;
        }

        if (activeTask && newStatus && activeTask.status !== newStatus) {
            // Optimistic update
            setTasks(prev => prev.map(t => t.id === activeTask.id ? { ...t, status: newStatus } : t));
            await api.projects.updateTask(activeTask.id, { status: newStatus });
            load(); // Re-sync with server
        }
    };

    const openCreate = (status = 'todo') => {
        setEditTask(null);
        setForm({ title: '', description: '', priority: 'medium', status, assigned_user_id: '', due_date: '' });
        setShowModal(true);
    };

    const openEdit = (task: any) => {
        setEditTask(task);
        setForm({ title: task.title, description: task.description || '', priority: task.priority, status: task.status, assigned_user_id: task.assigned_user_id || '', due_date: task.due_date || '' });
        setShowModal(true);
    };

    const save = async () => {
        const payload = { ...form, assigned_user_id: form.assigned_user_id || null, due_date: form.due_date || null };
        if (editTask) { await api.projects.updateTask(editTask.id, payload); }
        else { await api.projects.createTask(id!, payload); }
        setShowModal(false); load();
    };

    const remove = async (taskId: string) => {
        if (!confirm(t('projects.deleteConfirm'))) return;
        await api.projects.deleteTask(taskId);
        load();
    };

    return (
        <div className="page">
            <div className="page-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <button className="btn-icon" onClick={() => navigate('/projects')}>←</button>
                    <div className="page-title">{t('projects.tasks')}</div>
                </div>
                <button id="task-add" className="btn btn-primary btn-sm" onClick={() => openCreate()}>{t('projects.addTask')}</button>
            </div>
            
            <DndContext 
                sensors={sensors}
                collisionDetection={closestCorners}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
            >
                <div className="kanban">
                    {STATUSES.map(status => (
                        <div key={status} className="kanban-col">
                            <div className="kanban-col-header">
                                {status === 'todo' ? t('projects.statusTodo') : status === 'inProgress' ? t('projects.statusInProgress') : t('projects.statusDone')}
                            </div>
                            <button
                                className="btn btn-ghost btn-sm"
                                style={{ width: '100%', marginBottom: 8, justifyContent: 'center' }}
                                onClick={() => openCreate(status)}
                            >{t('projects.add')}</button>
                            
                            <SortableContext 
                                id={status}
                                items={tasks.filter(t => t.status === status).map(t => t.id)}
                                strategy={verticalListSortingStrategy}
                            >
                                <DroppableColumn status={status}>
                                    {tasks.filter(t => t.status === status).map(task => (
                                        <SortableTask 
                                            key={task.id} 
                                            task={task} 
                                            onClick={() => openEdit(task)} 
                                        />
                                    ))}
                                </DroppableColumn>
                            </SortableContext>
                        </div>
                    ))}
                </div>
                <DragOverlay dropAnimation={null}>
                    {activeId ? (
                        <TaskCard 
                            task={tasks.find(t => t.id === activeId)} 
                            isOverlay 
                        />
                    ) : null}
                </DragOverlay>
            </DndContext>

            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <span className="modal-title">{editTask ? t('projects.editTask') : t('projects.newTask')}</span>
                            <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
                        </div>
                        <div className="form-group">
                            <label className="label">{t('common.title')}</label>
                            <input id="task-title" className="input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} autoFocus />
                        </div>
                        <div className="form-group field-row">
                            <div>
                                <label className="label">{t('projects.status')}</label>
                                <select className="input" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                                    {STATUSES.map(s => (
                                        <option key={s} value={s}>
                                            {s === 'todo' ? t('projects.statusTodo') : s === 'inProgress' ? t('projects.statusInProgress') : t('projects.statusDone')}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="label">{t('projects.priority')}</label>
                                <select className="input" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
                                    <option value="low">{t('projects.low')}</option>
                                    <option value="medium">{t('projects.medium')}</option>
                                    <option value="high">{t('projects.high')}</option>
                                </select>
                            </div>
                        </div>
                        <div className="form-group field-row">
                            <div>
                                <label className="label">{t('chores.assignTo')}</label>
                                <select className="input" value={form.assigned_user_id} onChange={e => setForm(f => ({ ...f, assigned_user_id: e.target.value }))}>
                                    <option value="">{t('projects.unassigned')}</option>
                                    {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="label">{t('projects.dueDate')}</label>
                                <input type="date" className="input" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
                            </div>
                        </div>
                        <div className="form-group">
                            <label className="label">{t('projects.description')}</label>
                            <textarea className="input" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
                        </div>
                        <div className="modal-actions">
                            {editTask && <button className="btn btn-danger btn-sm" onClick={() => { remove(editTask.id); setShowModal(false); }}>{t('common.delete')}</button>}
                            <button id="task-save" className="btn btn-primary" onClick={save}>{t('common.save')}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function Projects() {
    return (
        <Routes>
            <Route path="/" element={<ProjectList />} />
            <Route path="/:id" element={<ProjectBoard />} />
        </Routes>
    );
}
