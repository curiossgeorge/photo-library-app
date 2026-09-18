import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './style.css'

const DB_NAME = 'photo-library-indexeddb-v1'
const DB_VERSION = 1
const FOLDERS = 'folders'
const PHOTOS = 'photos'

const starterFolders = [
  { id: 'cars', name: 'Cars', parentId: null },
  { id: 'school', name: 'School', parentId: null },
  { id: 'family', name: 'Family', parentId: null },
  { id: 'friends', name: 'Friends', parentId: null },
  { id: 'trips', name: 'Trips', parentId: null },
  { id: 'other', name: 'Other', parentId: null }
]

const uid = p => `${p}-${crypto.randomUUID?.() || Date.now() + Math.random()}`

// --- IndexedDB Helper Functions ---
function openDB() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, DB_VERSION)
    r.onupgradeneeded = () => {
      const d = r.result
      if (!d.objectStoreNames.contains(FOLDERS)) d.createObjectStore(FOLDERS, { keyPath: 'id' })
      if (!d.objectStoreNames.contains(PHOTOS)) d.createObjectStore(PHOTOS, { keyPath: 'id' })
    }
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}

function getAll(store) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const r = db.transaction(store, 'readonly').objectStore(store).getAll()
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  }))
}

function put(store, value) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(store, 'readwrite')
    t.objectStore(store).put(value)
    t.oncomplete = resolve
    t.onerror = () => reject(t.error)
  }))
}

function remove(store, key) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(store, 'readwrite')
    t.objectStore(store).delete(key)
    t.oncomplete = resolve
    t.onerror = () => reject(t.error)
  }))
}

// Helper to convert legacy base64 strings to Blob
function dataURLtoBlob(dataurl) {
  if (!dataurl || typeof dataurl !== 'string' || !dataurl.startsWith('data:')) return null
  try {
    const arr = dataurl.split(',')
    const mimeMatch = arr[0].match(/:(.*?);/)
    const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg'
    const bstr = atob(arr[1])
    let n = bstr.length
    const u8arr = new Uint8Array(n)
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n)
    }
    return new Blob([u8arr], { type: mime })
  } catch (e) {
    console.error('Failed to convert base64 to Blob:', e)
    return null
  }
}

function App() {
  const [folders, setFolders] = useState([])
  const [photos, setPhotos] = useState([])
  const [currentFolderId, setCurrentFolderId] = useState(null)
  const [modal, setModal] = useState(null)
  const [name, setName] = useState('')
  const [selectedPhoto, setSelectedPhoto] = useState(null)
  const [confirmDeletePhoto, setConfirmDeletePhoto] = useState(null)
  const [error, setError] = useState('')
  const [storageInfo, setStorageInfo] = useState({ usage: 0, quota: 0, persisted: false })
  const inputRef = useRef(null)

  // 1. Persistent Storage & Storage Status Check
  const updateStorageStatus = async () => {
    if (navigator.storage && navigator.storage.estimate) {
      try {
        const estimate = await navigator.storage.estimate()
        const isPersisted = navigator.storage.persisted ? await navigator.storage.persisted() : false
        setStorageInfo({
          usage: estimate.usage || 0,
          quota: estimate.quota || 0,
          persisted: isPersisted
        })
      } catch (e) {
        console.error('Storage estimate error:', e)
      }
    }
  }

  const requestPersistence = async () => {
    if (navigator.storage && navigator.storage.persist) {
      const isPersisted = await navigator.storage.persist()
      setStorageInfo(prev => ({ ...prev, persisted: isPersisted }))
      if (isPersisted) {
        alert('Persistent storage granted! Browser eviction chance is now minimized.')
      } else {
        alert('Persistent storage was not granted by the browser.')
      }
    }
  }

  // 2. Existing-Library Migration & DB Initialization
  useEffect(() => {
    (async () => {
      try {
        // Request persistence quietly on startup
        if (navigator.storage && navigator.storage.persist) {
          await navigator.storage.persist()
        }

        let fs = await getAll(FOLDERS)
        let ps = await getAll(PHOTOS)

        // Check for legacy localStorage data
        const legacyFolders = localStorage.getItem('photo_folders') || localStorage.getItem('folders')
        const legacyPhotos = localStorage.getItem('photo_library') || localStorage.getItem('photos')

        if (legacyFolders) {
          try {
            const parsedFs = JSON.parse(legacyFolders)
            if (Array.isArray(parsedFs)) {
              for (const f of parsedFs) {
                await put(FOLDERS, f)
              }
            }
          } catch (e) {
            console.error('Error parsing legacy folders:', e)
          }
        }

        if (legacyPhotos) {
          try {
            const parsedPs = JSON.parse(legacyPhotos)
            if (Array.isArray(parsedPs)) {
              for (const p of parsedPs) {
                let photoBlob = p.blob
                if (!photoBlob && p.url && p.url.startsWith('data:')) {
                  photoBlob = dataURLtoBlob(p.url)
                } else if (!photoBlob && p.data && p.data.startsWith('data:')) {
                  photoBlob = dataURLtoBlob(p.data)
                }

                if (photoBlob) {
                  await put(PHOTOS, {
                    id: p.id || uid('photo'),
                    name: p.name || 'Migrated Photo',
                    type: photoBlob.type || 'image/jpeg',
                    size: photoBlob.size || 0,
                    createdAt: p.createdAt || Date.now(),
                    folderId: p.folderId || null,
                    blob: photoBlob
                  })
                }
              }
            }
          } catch (e) {
            console.error('Error parsing legacy photos:', e)
          }
        }

        fs = await getAll(FOLDERS)
        ps = await getAll(PHOTOS)

        if (!fs.length) {
          for (const f of starterFolders) await put(FOLDERS, f)
          fs = starterFolders
        }

        setFolders(fs)
        setPhotos(ps)
        await updateStorageStatus()
      } catch (e) {
        console.error(e)
        setError('Could not open your photo library.')
      }
    })()
  }, [])

  const currentFolder = folders.find(f => f.id === currentFolderId) || null
  const children = useMemo(() => folders.filter(f => f.parentId === currentFolderId), [folders, currentFolderId])
  const currentPhotos = useMemo(() => photos.filter(p => (p.folderId || null) === currentFolderId), [photos, currentFolderId])

  async function refresh() {
    setFolders(await getAll(FOLDERS))
    setPhotos(await getAll(PHOTOS))
    await updateStorageStatus()
  }

  function openCreate(parentId) {
    setName('')
    setModal({ type: 'create', parentId })
  }

  async function createFolder() {
    const n = name.trim()
    if (!n) return
    const duplicate = folders.some(f => f.parentId === modal.parentId && f.name.toLowerCase() === n.toLowerCase())
    if (duplicate) {
      setModal({ type: 'error', message: 'A folder with that name already exists here.' })
      return
    }
    await put(FOLDERS, { id: uid('folder'), name: n, parentId: modal.parentId })
    await refresh()
    setModal(null)
  }

  function openRename(folder) {
    setName(folder.name)
    setModal({ type: 'rename', folderId: folder.id })
  }

  async function renameFolder() {
    const n = name.trim()
    if (!n) return
    const f = folders.find(x => x.id === modal.folderId)
    if (!f) return
    const duplicate = folders.some(x => x.id !== f.id && x.parentId === f.parentId && x.name.toLowerCase() === n.toLowerCase())
    if (duplicate) {
      setModal({ type: 'error', message: 'A folder with that name already exists here.' })
      return
    }
    await put(FOLDERS, { ...f, name: n })
    await refresh()
    setModal(null)
  }

  async function deleteFolder(folderId) {
    const ids = new Set([folderId])
    let changed = true
    while (changed) {
      changed = false
      for (const f of folders) {
        if (f.parentId && ids.has(f.parentId) && !ids.has(f.id)) {
          ids.add(f.id)
          changed = true
        }
      }
    }
    for (const f of folders) {
      if (ids.has(f.id)) await remove(FOLDERS, f.id)
    }
    for (const p of photos) {
      if (ids.has(p.folderId)) await put(PHOTOS, { ...p, folderId: null })
    }
    await refresh()
    if (ids.has(currentFolderId)) setCurrentFolderId(null)
  }

  async function uploadPhotos(e) {
    const files = [...e.target.files]
    e.target.value = ''
    if (!files.length) return
    setError('')
    try {
      for (const file of files) {
        if (!file.type.startsWith('image/')) continue
        await put(PHOTOS, {
          id: uid('photo'),
          name: file.name,
          type: file.type,
          size: file.size,
          createdAt: Date.now(),
          folderId: currentFolderId,
          blob: file
        })
      }
      await refresh()
    } catch (err) {
      console.error(err)
      setError('Could not save the photo. Your browser may be low on storage.')
    }
  }

  async function movePhoto(photo, folderId) {
    await put(PHOTOS, { ...photo, folderId: folderId || null })
    await refresh()
  }

  async function executeDeletePhoto(photoId) {
    await remove(PHOTOS, photoId)
    setConfirmDeletePhoto(null)
    if (selectedPhoto && selectedPhoto.id === photoId) {
      setSelectedPhoto(null)
    }
    await refresh()
  }

  const crumbs = []
  let id = currentFolderId
  while (id) {
    const f = folders.find(x => x.id === id)
    if (!f) break
    crumbs.unshift(f)
    id = f.parentId
  }

  const formattedUsage = (storageInfo.usage / (1024 * 1024)).toFixed(1)
  const formattedQuota = (storageInfo.quota / (1024 * 1024 * 1024)).toFixed(1)

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">My Photo Library</div>
        <button className={currentFolderId === null ? 'nav active' : 'nav'} onClick={() => setCurrentFolderId(null)}>
          ▦ Every Photo
        </button>
        <div className="section-title">Folders</div>
        <div className="folder-list">
          {folders.filter(f => f.parentId === null).map(f => (
            <FolderTree key={f.id} folder={f} folders={folders} currentId={currentFolderId} onOpen={setCurrentFolderId} />
          ))}
        </div>
        <button className="new-folder-side" onClick={() => openCreate(currentFolderId)}>
          + New Folder
        </button>

        {/* Storage Status Bar */}
        <div className="storage-box">
          <div className="storage-header">
            <span>Storage Status</span>
            <span className={`badge ${storageInfo.persisted ? 'persisted' : 'transient'}`}>
              {storageInfo.persisted ? 'Persistent' : 'Temporary'}
            </span>
          </div>
          {storageInfo.quota > 0 && (
            <div className="storage-meter">
              <div className="meter-bar" style={{ width: `${Math.min(100, (storageInfo.usage / storageInfo.quota) * 100)}%` }}></div>
            </div>
          )}
          <div className="storage-details">
            {formattedUsage} MB used {storageInfo.quota > 0 ? `of ${formattedQuota} GB` : ''}
          </div>
          {!storageInfo.persisted && (
            <button className="persist-btn" onClick={requestPersistence}>
              🛡️ Enable Protection
            </button>
          )}
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <div className="eyebrow">PHOTO LIBRARY</div>
            <h1>{currentFolder ? currentFolder.name : 'Every Photo'}</h1>
          </div>
          <label className="upload">
            + Upload Photos
            <input ref={inputRef} type="file" accept="image/*" multiple onChange={uploadPhotos} />
          </label>
        </header>

        {error && <div className="error">{error}</div>}

        <div className="toolbar">
          <div className="breadcrumbs">
            <button onClick={() => setCurrentFolderId(null)}>Every Photo</button>
            {crumbs.map(f => (
              <React.Fragment key={f.id}>
                <span>/</span>
                <button onClick={() => setCurrentFolderId(f.id)}>{f.name}</button>
              </React.Fragment>
            ))}
          </div>
          {currentFolder && (
            <div className="folder-actions">
              <button onClick={() => openRename(currentFolder)}>Rename</button>
              <button
                className="danger-text"
                onClick={() => {
                  if (confirm('Delete this folder and its subfolders? Photos will stay in Every Photo.')) {
                    deleteFolder(currentFolder.id)
                  }
                }}
              >
                Delete
              </button>
            </div>
          )}
        </div>

        <section className="content">
          <div className="section-heading">
            <div>
              <h2>{currentFolder ? 'Folders & Photos' : 'Your Library'}</h2>
              <p>{currentFolder ? 'Create folders inside this folder to organize your photos.' : 'Everything stays accessible from one master library.'}</p>
            </div>
            <button className="primary" onClick={() => openCreate(currentFolderId)}>
              + New Folder
            </button>
          </div>

          {children.length > 0 && (
            <div className="grid folders">
              {children.map(folder => (
                <div className="folder-card" key={folder.id}>
                  <button className="folder-open" onClick={() => setCurrentFolderId(folder.id)}>
                    <div className="folder-icon">📁</div>
                    <div className="folder-name">{folder.name}</div>
                    <div className="folder-count">{folders.filter(f => f.parentId === folder.id).length} subfolder(s)</div>
                  </button>
                  <button className="dots" onClick={() => openRename(folder)}>•••</button>
                </div>
              ))}
            </div>
          )}

          {currentPhotos.length > 0 && (
            <div className="grid photos">
              {currentPhotos.map(photo => (
                <PhotoCard
                  key={photo.id}
                  photo={photo}
                  folders={folders}
                  onOpen={setSelectedPhoto}
                  onMove={movePhoto}
                  onDelete={p => setConfirmDeletePhoto(p)}
                />
              ))}
            </div>
          )}

          {children.length === 0 && currentPhotos.length === 0 && (
            <div className="empty">
              <div className="empty-icon">📷</div>
              <h3>{currentFolder ? 'This folder is empty' : 'Your library is empty'}</h3>
              <p>Create a folder or upload some photos to get started.</p>
              <button className="primary" onClick={() => inputRef.current?.click()}>
                + Upload Photos
              </button>
            </div>
          )}
        </section>
      </main>

      {/* Folder Modals */}
      {modal && (
        <div className="modal-backdrop" onMouseDown={() => setModal(null)}>
          <div className="modal" onMouseDown={e => e.stopPropagation()}>
            {modal.type === 'error' ? (
              <>
                <h3>Folder not created</h3>
                <p>{modal.message}</p>
                <button className="primary full" onClick={() => openCreate(currentFolderId)}>
                  Try Again
                </button>
              </>
            ) : (
              <>
                <h3>{modal.type === 'rename' ? 'Rename Folder' : 'Create Folder'}</h3>
                <p>{modal.type === 'rename' ? 'Choose a new name for this folder.' : 'Give your folder a name.'}</p>
                <input
                  autoFocus
                  value={name}
                  onChange={e => setName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') modal.type === 'rename' ? renameFolder() : createFolder()
                    if (e.key === 'Escape') setModal(null)
                  }}
                  placeholder="Folder name"
                />
                <div className="modal-actions">
                  <button onClick={() => setModal(null)}>Cancel</button>
                  <button className="primary" onClick={modal.type === 'rename' ? renameFolder : createFolder}>
                    {modal.type === 'rename' ? 'Save Name' : 'Create Folder'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Delete Photo Confirmation Modal */}
      {confirmDeletePhoto && (
        <div className="modal-backdrop" onMouseDown={() => setConfirmDeletePhoto(null)}>
          <div className="modal" onMouseDown={e => e.stopPropagation()}>
            <h3>Delete Photo</h3>
            <p>Are you sure you want to permanently delete "{confirmDeletePhoto.name}"? This action cannot be undone.</p>
            <div className="modal-actions">
              <button onClick={() => setConfirmDeletePhoto(null)}>Cancel</button>
              <button className="danger-btn" onClick={() => executeDeletePhoto(confirmDeletePhoto.id)}>
                Delete Photo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox Viewer */}
      {selectedPhoto && (
        <Lightbox
          photo={selectedPhoto}
          folders={folders}
          onClose={() => setSelectedPhoto(null)}
          onMove={movePhoto}
          onDelete={p => setConfirmDeletePhoto(p)}
        />
      )}
    </div>
  )
}

function FolderTree({ folder, folders, currentId, onOpen, depth = 0 }) {
  const children = folders.filter(f => f.parentId === folder.id)
  return (
    <div>
      <button
        className={currentId === folder.id ? 'tree-row selected' : 'tree-row'}
        style={{ paddingLeft: 14 + depth * 16 }}
        onClick={() => onOpen(folder.id)}
      >
        <span>📁</span>
        {folder.name}
      </button>
      {children.map(c => (
        <FolderTree key={c.id} folder={c} folders={folders} currentId={currentId} onOpen={onOpen} depth={depth + 1} />
      ))}
    </div>
  )
}

function PhotoCard({ photo, folders, onOpen, onMove, onDelete }) {
  const [src, setSrc] = useState('')
  const [showMoveSelect, setShowMoveSelect] = useState(false)

  useEffect(() => {
    if (!photo.blob) return
    const u = URL.createObjectURL(photo.blob)
    setSrc(u)
    return () => URL.revokeObjectURL(u)
  }, [photo.blob])

  return (
    <div className="photo-card-wrapper">
      <button className="photo-card" onClick={() => onOpen(photo)}>
        {src && <img src={src} alt={photo.name} />}
      </button>

      <div className="photo-card-actions">
        {showMoveSelect ? (
          <select
            className="folder-select"
            value={photo.folderId || ''}
            onChange={e => {
              onMove(photo, e.target.value || null)
              setShowMoveSelect(false)
            }}
            onBlur={() => setShowMoveSelect(false)}
            autoFocus
          >
            <option value="">Every Photo (Uncategorized)</option>
            {folders.map(f => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        ) : (
          <button className="action-btn" onClick={() => setShowMoveSelect(true)}>
            📁 Move
          </button>
        )}
        <button className="action-btn danger" onClick={() => onDelete(photo)}>
          🗑️
        </button>
      </div>
    </div>
  )
}

function Lightbox({ photo, folders, onClose, onMove, onDelete }) {
  const [src, setSrc] = useState('')

  useEffect(() => {
    if (!photo.blob) return
    const u = URL.createObjectURL(photo.blob)
    setSrc(u)
    return () => URL.revokeObjectURL(u)
  }, [photo.blob])

  return (
    <div className="lightbox" onClick={onClose}>
      <button className="close" onClick={onClose}>
        ×
      </button>

      <div className="lightbox-content" onClick={e => e.stopPropagation()}>
        {src && <img src={src} alt={photo.name} />}

        <div className="lightbox-bar">
          <span className="photo-title">{photo.name}</span>
          <div className="lightbox-actions">
            <select
              className="folder-select-dark"
              value={photo.folderId || ''}
              onChange={e => onMove(photo, e.target.value || null)}
            >
              <option value="">Move to: Every Photo</option>
              {folders.map(f => (
                <option key={f.id} value={f.id}>
                  Move to: {f.name}
                </option>
              ))}
            </select>
            <button
              className="danger-btn"
              onClick={() => {
                onDelete(photo)
              }}
            >
              🗑️ Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')).render(<App />)