import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

export function App() {
  useEffect(() => {
    async function loadCloudPhotos() {
      const { data, error } = await supabase.storage.from('photods').list('', { limit: 1000, recursive: true });
      if (data) console.log('Fetched cloud photos:', data);
    }
    loadCloudPhotos();
  }, []);

  const [photos, setPhotos] = useState([])
  const [syncing, setSyncing] = useState(false)
  const [syncStatus, setSyncStatus] = useState('')

  useEffect(() => {
    fetchCloudPhotos()
  }, [])

  const fetchCloudPhotos = async () => {
    const { data, error } = await supabase.storage.from('photods').list()
    if (error) {
      console.error('Error fetching photos:', error)
      return
    }
    const loadedPhotos = data.map((file) => {
      const { data: urlData } = supabase.storage.from('photods').getPublicUrl(file.name)
      return { id: file.id, name: file.name, url: urlData.publicUrl }
    })
    setPhotos(loadedPhotos)
  }

  const handleCloudSync = async () => {
    setSyncing(true)
    setSyncStatus('Reading local photos...')
    try {
      const localPhotos = JSON.parse(localStorage.getItem('photo_library') || '[]')
      if (localPhotos.length === 0) {
        setSyncStatus('No local photos found to sync.')
        setSyncing(false)
        return
      }
      setSyncStatus('Syncing photos to cloud...')
      for (let i = 0; i < localPhotos.length; i++) {
        const photo = localPhotos[i]
        if (photo.url && photo.url.startsWith('http')) continue
        const response = await fetch(photo.url || photo.data)
        const blob = await response.blob()
        const fileName = 'photo_' + Date.now() + '_' + i + '.jpg'
        const { error: uploadError } = await supabase.storage.from('photods').upload(fileName, blob, { upsert: true })
        if (uploadError) throw uploadError
      }
      setSyncStatus('Sync complete! Refreshing library...')
      await fetchCloudPhotos()
    } catch (err) {
      console.error(err)
      setSyncStatus('Sync failed: ' + err.message)
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h1>Photo Library</h1>
      <button onClick={handleCloudSync} disabled={syncing} style={{ padding: '10px 16px', backgroundColor: '#3ecf8e', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', marginBottom: '15px' }}>
        {syncing ? 'Syncing...' : 'Sync Local Photos to Cloud'}
      </button>
      {syncStatus && <p style={{ color: '#666' }}>{syncStatus}</p>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '10px', marginTop: '20px' }}>
        {photos.map((photo) => (
          <img key={photo.id || photo.name} src={photo.url} alt='Library entry' style={{ width: '100%', height: '150px', objectFit: 'cover', borderRadius: '8px' }} />
        ))}
      </div>
    </div>
  )
}

export default App

