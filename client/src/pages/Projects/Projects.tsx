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
    verticalListSortingStrategy,
    useSortable,
    SortableContext,
    sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { api } from '../../api';
import { t } from '../../i18n';
import ConfirmModal from '../../components/ConfirmModal';
import { toastError } from '../../store/toast';
import type {
    AuthUser,
    ProjectInput,
    ProjectSummary,
    ProjectTask,
    ProjectTaskInput,
    ProjectTaskPriority,
    ProjectTaskStatus,
} from '../../../../shared/contracts';

type ProjectFormState = Pick<ProjectInput, 'name' | 'description'>;
type TaskFormState = {
    title: string;
    description: string;
    priority: ProjectTaskPriority;
    status: ProjectTaskStatus;
    assigned_user_id: string;
    due_date: string;
};

function ProjectList() {
    const [projects, setProjects] = useState<ProjectSummary[]>([]);
    const [showModal, setShowModal] = useState(false);
    const [form, setForm] = useState<ProjectFormState>({ name: '', description: '' });
    const navigate = useNavigate();
    
    // Modal state
    const [confirmArchiveId, setConfirmArchiveId] = useState<string | null>(null);

    const load = async () => { setProjects(await api.projects.getAll()); };
    useEffect(() => { load(); }, []);

    const create = async (e: React.FormEvent) => {
        e.preventDefault();
        await api.projects.create(form);
        setShowModal(false); load();
        setForm({ name: '', description: '' });
    };

    const handleArchive = async () => {
        if (!confirmArchiveId) return;
        await api.projects.update(confirmArchiveId, { status: 'archived' });
        setConfirmArchiveId(null);
        load();
    };

    const active = projects.filter(p => p.status === 'active');
    const archived = projects.filter(p => p.status === 'archived');

    return (
        <div className="page">
            <div className="page-header">
                <div className="page-title">{t('page.projects')}</div>
                <button 
                  id="projects-add" 
                  className="btn btn-primary btn-sm touch-target" 
                  onClick={() => setShowModal(true)}
                  aria-label={t('projects.addProject')}
                >
                    {t('projects.addProject')}
                </button>
            </div>
            {active.map(p => (
                <div key={p.id} className="project-item" onClick={() => navigate(`/projects/${p.id}`)}>
                    <div style={{ flex: 1 }}>
                        <div className="project-name">{p.name}</div>
                        {p.description && <div className="project-meta">{p.description}</div>}
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span className="badge badge-green">{t('projects.active')}</span>
                        <button 
                            className="btn-icon touch-target" 
                            onClick={e => { e.stopPropagation(); setConfirmArchiveId(p.id); }} 
                            title={t('projects.archive')}
                            aria-label={`${t('projects.archive')} ${p.name}`}
                        >
                            📦
                        </button>
                    </div>
                </div>
            ))}
            {active.length === 0 && <p className="empty-state"><span className="icon">📋</span><br />{t('projects.noActive')}</p>}
            {archived.length > 0 && <>
                <div className="divider" style={{ margin: '24px 0 16px' }} />
                <div className="dash-section-title">{t('projects.archivedTitle')}</div>
                {archived.map(p => (
                    <div key={p.id} className="project-item" style={{ opacity: 0.5 }} onClick={() => navigate(`/projects/${p.id}`)}>
                        <div className="project-name">{p.name}</div>
                    </div>
                ))}
            </>}

            <ConfirmModal
                isOpen={!!confirmArchiveId}
                title={t('projects.archive')}
                message={t('projects.archiveConfirm')}
                onConfirm={handleArchive}
                onCancel={() => setConfirmArchiveId(null)}
                confirmText={t('common.archive')}
            />

            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <span className="modal-title">{t('projects.newProject')}</span>
                            <button className="modal-close touch-target" onClick={() => setShowModal(false)} aria-label={t('common.close')}>×</button>
                        </div>
                        <form onSubmit={create}>
                            <div className="form-group">
                                <label className="label" htmlFor="project-name">{t('common.title')}</label>
                                <input id="project-name" className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required autoFocus />
                            </div>
                            <div className="form-group">
                                <label className="label" htmlFor="project-desc">{t('projects.description')}</label>
                                <textarea id="project-desc" className="input" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
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

const STATUSES: ProjectTaskStatus[] = ['todo', 'inProgress', 'done'];

function TaskCard({ task, onClick, isOverlay, style }: { task: ProjectTask | undefined, onClick?: () => void, isOverlay?: boolean, style?: React.CSSProperties }) {
    if (!task) return null;
    return (
        <div
            style={style}
            className={`task-card ${isOverlay ? 'dragging-overlay' : ''}`}
            onClick={onClick}
        >
            <div className="task-title">{task.title}</div>
            <div className="task-meta">
                <span className={`priority-badge priority-${task.priority}`}>{t(`projects.${task.priority}`)}</span>
                {task.assigned_name && (
                    <span className="avatar" style={{ background: task.assigned_color || undefined }} title={task.assigned_name}>{task.assigned_name[0]}</span>
                )}
                {task.due_date && <span>📅 {task.due_date.slice(0, 10)}</span>}
            </div>
        </div>
    );
}

function SortableTask({ task, onClick }: { task: ProjectTask, onClick: () => void }) {
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
    const { setNodeRef, isOver } = useDroppable({ id: status });
    return (
        <div 
            ref={setNodeRef} 
            className={`kanban-task-list ${isOver ? 'drop-active' : ''}`}
            style={{ 
                minHeight: 100, 
                borderRadius: 8, 
                transition: 'background var(--transition-fast)',
                background: isOver ? 'rgba(var(--accent-rgb), 0.05)' : 'transparent'
             }}
        >
            {children}
        </div>
    );
}

function ProjectBoard() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [tasks, setTasks] = useState<ProjectTask[]>([]);
    const [members, setMembers] = useState<AuthUser[]>([]);
    const [showModal, setShowModal] = useState(false);
    const [editTask, setEditTask] = useState<ProjectTask | null>(null);
    const [activeId, setActiveId] = useState<string | null>(null);
    const [form, setForm] = useState<TaskFormState>({ title: '', description: '', priority: 'medium', status: 'todo', assigned_user_id: '', due_date: '' });
    
    // Modal state
    const [confirmDeleteTaskId, setConfirmDeleteTaskId] = useState<string | null>(null);

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

        let newStatus: ProjectTaskStatus | null = null;
        if (STATUSES.includes(overId as ProjectTaskStatus)) {
            newStatus = overId as ProjectTaskStatus;
        } else {
            const overTask = tasks.find(t => t.id === over.id);
            if (overTask) newStatus = overTask.status;
        }

        if (activeTask && newStatus && activeTask.status !== newStatus) {
            const previousTasks = tasks;
            setTasks(prev => prev.map(t => t.id === activeTask.id ? { ...t, status: newStatus } : t));

            try {
                const updatedTask = await api.projects.updateTask(activeTask.id, { status: newStatus });
                setTasks(prev => prev.map(t => t.id === updatedTask.id ? { ...t, ...updatedTask } : t));
            } catch (error: any) {
                setTasks(previousTasks);
                toastError('No se pudo mover la tarea', error?.message || 'Vuelve a intentarlo.');
            }
        }
    };

    const openCreate = (status: ProjectTaskStatus = 'todo') => {
        setEditTask(null);
        setForm({ title: '', description: '', priority: 'medium', status, assigned_user_id: '', due_date: '' });
        setShowModal(true);
    };

    const openEdit = (task: ProjectTask) => {
        setEditTask(task);
        setForm({ title: task.title, description: task.description || '', priority: task.priority, status: task.status, assigned_user_id: task.assigned_user_id || '', due_date: (task.due_date || '').slice(0, 10) });
        setShowModal(true);
    };

    const save = async () => {
        if (!form.title.trim()) return;
        const payload: ProjectTaskInput = {
            ...form,
            assigned_user_id: form.assigned_user_id || null,
            due_date: form.due_date || null,
        };
        if (editTask) { await api.projects.updateTask(editTask.id, payload); }
        else { await api.projects.createTask(id!, payload); }
        setShowModal(false); load();
    };

    const handleDeleteTask = async () => {
        if (!confirmDeleteTaskId) return;
        await api.projects.deleteTask(confirmDeleteTaskId);
        setConfirmDeleteTaskId(null);
        setShowModal(false);
        load();
    };

    return (
        <div className="page" style={{ maxWidth: '100%' }}>
            <div className="page-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <button className="btn-icon touch-target" onClick={() => navigate('/projects')} aria-label={t('common.back', 'Volver')}>←</button>
                    <div className="page-title">{t('projects.tasks')}</div>
                </div>
                <button id="task-add" className="btn btn-primary btn-sm touch-target" onClick={() => openCreate()} aria-label={t('projects.addTask')}>
                    {t('projects.addTask')}
                </button>
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
                                <span className="badge" style={{ marginLeft: 8, opacity: 0.6 }}>{tasks.filter(t => t.status === status).length}</span>
                            </div>
                            <button
                                className="btn btn-ghost btn-sm touch-target"
                                style={{ width: '100%', marginBottom: 12, justifyContent: 'center' }}
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

            {/* Task Delete Confirmation */}
            <ConfirmModal
                isOpen={!!confirmDeleteTaskId}
                title={t('common.delete')}
                message={t('projects.deleteConfirm')}
                onConfirm={handleDeleteTask}
                onCancel={() => setConfirmDeleteTaskId(null)}
                isDanger
            />

            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <span className="modal-title">{editTask ? t('projects.editTask') : t('projects.newTask')}</span>
                            <button className="modal-close touch-target" onClick={() => setShowModal(false)} aria-label={t('common.close')}>×</button>
                        </div>
                        <div className="modal-body">
                            <div className="form-group">
                                <label className="label" htmlFor="task-title">{t('common.title')}</label>
                                <input id="task-title" className="input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} autoFocus />
                            </div>
                            <div className="form-group field-grid two">
                                <div>
                                    <label className="label">{t('projects.status')}</label>
                                    <select className="input" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as ProjectTaskStatus }))}>
                                        {STATUSES.map(s => (
                                            <option key={s} value={s}>
                                                {s === 'todo' ? t('projects.statusTodo') : s === 'inProgress' ? t('projects.statusInProgress') : t('projects.statusDone')}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="label">{t('projects.priority')}</label>
                                    <select className="input" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value as ProjectTaskPriority }))}>
                                        <option value="low">{t('projects.low')}</option>
                                        <option value="medium">{t('projects.medium')}</option>
                                        <option value="high">{t('projects.high')}</option>
                                    </select>
                                </div>
                            </div>
                            <div className="form-group field-grid two">
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
                                <textarea className="input" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} />
                            </div>
                        </div>
                        <div className="modal-actions">
                            {editTask && (
                                <button className="btn btn-danger btn-sm" onClick={() => setConfirmDeleteTaskId(editTask.id)}>
                                    {t('common.delete')}
                                </button>
                            )}
                            <div className="modal-actions-spacer" />
                            <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>{t('common.cancel')}</button>
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
