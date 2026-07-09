import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { AUDIT_ACTION_TYPES, AUDIT_TARGET_TYPES, writeAuditLog } from '../audit/auditLog'
import { useCurrentUser } from '../auth/UserContext'
import type {
  Sfsures_resources,
  Sfsures_resourcessfsures_calendarcolor,
} from '../generated/models/Sfsures_resourcesModel'
import type { Sfsures_resourcetypes } from '../generated/models/Sfsures_resourcetypesModel'
import { Sfsures_resourcesService } from '../generated/services/Sfsures_resourcesService'
import { Sfsures_resourcetypesService } from '../generated/services/Sfsures_resourcetypesService'
import {
  RESOURCE_COLOR_OPTIONS,
  resourceColorByValue,
} from '../theme/resourceColors'
import { useFocusTrap } from '../a11y/useFocusTrap'
import styles from './AdminApp.module.css'

interface AdminResourceType {
  resourceTypeId: string
  name: string
  description: string
  status: number
}

interface AdminResource {
  resourceId: string
  name: string
  resourceTypeId: string
  resourceTypeName: string
  location: string
  description: string
  calendarColor: Sfsures_resourcessfsures_calendarcolor
  recordStatus: number
}

interface ResourceTypeForm {
  id: string | null
  name: string
  description: string
}

interface ResourceForm {
  id: string | null
  name: string
  resourceTypeId: string
  location: string
  description: string
  calendarColor: Sfsures_resourcessfsures_calendarcolor
}

type ResourceDialog =
  | { kind: 'resourceType'; mode: 'create' | 'edit' }
  | { kind: 'resource'; mode: 'create' | 'edit' }

const RESOURCE_TYPE_STATUS_ACTIVE = 997330000
const RESOURCE_TYPE_STATUS_INACTIVE = 997330001
const RESOURCE_STATUS_ACTIVE = 997330000
const RESOURCE_STATUS_DISABLED = 997330001
const DEFAULT_RESOURCE_COLOR = RESOURCE_COLOR_OPTIONS[0].value

const EMPTY_RESOURCE_TYPE_FORM: ResourceTypeForm = {
  id: null,
  name: '',
  description: '',
}

function emptyResourceForm(resourceTypeId = ''): ResourceForm {
  return {
    id: null,
    name: '',
    resourceTypeId,
    location: '',
    description: '',
    calendarColor: DEFAULT_RESOURCE_COLOR,
  }
}

function resourceTypeFormFrom(resourceType: AdminResourceType | null): ResourceTypeForm {
  if (!resourceType) {
    return EMPTY_RESOURCE_TYPE_FORM
  }

  return {
    id: resourceType.resourceTypeId,
    name: resourceType.name,
    description: resourceType.description,
  }
}

function resourceFormFrom(resource: AdminResource | null, fallbackResourceTypeId: string): ResourceForm {
  if (!resource) {
    return emptyResourceForm(fallbackResourceTypeId)
  }

  return {
    id: resource.resourceId,
    name: resource.name,
    resourceTypeId: resource.resourceTypeId || fallbackResourceTypeId,
    location: resource.location,
    description: resource.description,
    calendarColor: resource.calendarColor,
  }
}

function resourceTypeMatchesSearch(resourceType: AdminResourceType, search: string): boolean {
  const normalizedSearch = search.trim().toLowerCase()
  if (!normalizedSearch) return true

  return [resourceType.name, resourceType.description].some((value) =>
    value.toLowerCase().includes(normalizedSearch)
  )
}

function resourceMatchesSearch(resource: AdminResource, search: string): boolean {
  const normalizedSearch = search.trim().toLowerCase()
  if (!normalizedSearch) return true

  return [
    resource.name,
    resource.resourceTypeName,
    resource.location,
    resource.description,
  ].some((value) => value.toLowerCase().includes(normalizedSearch))
}

function resourceTypeSnapshot(resourceType: AdminResourceType | ResourceTypeForm) {
  return {
    resourceTypeId: 'resourceTypeId' in resourceType ? resourceType.resourceTypeId : resourceType.id,
    name: resourceType.name,
    description: resourceType.description || null,
    status: 'status' in resourceType ? resourceType.status : RESOURCE_TYPE_STATUS_ACTIVE,
  }
}

function resourceSnapshot(resource: AdminResource | ResourceForm, resourceTypeName?: string) {
  const color = resourceColorByValue(resource.calendarColor)

  return {
    resourceId: 'resourceId' in resource ? resource.resourceId : resource.id,
    name: resource.name,
    resourceTypeId: resource.resourceTypeId,
    resourceTypeName:
      resourceTypeName ?? ('resourceTypeName' in resource ? resource.resourceTypeName : undefined),
    location: resource.location || null,
    description: resource.description || null,
    calendarColor: resource.calendarColor,
    calendarColorName: color?.label ?? null,
    recordStatus: 'recordStatus' in resource ? resource.recordStatus : RESOURCE_STATUS_ACTIVE,
  }
}

export default function ResourcesScreen() {
  const currentUser = useCurrentUser()
  const colorPickerId = useId()
  const colorPickerLabelId = `${colorPickerId}-label`
  const colorPickerListboxId = `${colorPickerId}-listbox`
  const dialogTitleId = `${colorPickerId}-dialog-title`
  const [resourceTypes, setResourceTypes] = useState<AdminResourceType[]>([])
  const [resources, setResources] = useState<AdminResource[]>([])
  const [selectedResourceTypeId, setSelectedResourceTypeId] = useState<string | null>(null)
  const [selectedResourceId, setSelectedResourceId] = useState<string | null>(null)
  const [resourceTypeSearch, setResourceTypeSearch] = useState('')
  const [resourceSearch, setResourceSearch] = useState('')
  const [resourceTypeForm, setResourceTypeForm] = useState<ResourceTypeForm>(EMPTY_RESOURCE_TYPE_FORM)
  const [resourceForm, setResourceForm] = useState<ResourceForm>(emptyResourceForm())
  const [loadStatus, setLoadStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [savingResourceType, setSavingResourceType] = useState(false)
  const [savingResource, setSavingResource] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [activeDialog, setActiveDialog] = useState<ResourceDialog | null>(null)
  const [modalError, setModalError] = useState('')
  const selectedResourceTypeIdRef = useRef<string | null>(null)
  const selectedResourceIdRef = useRef<string | null>(null)
  const colorPickerRef = useRef<HTMLDivElement | null>(null)
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const [colorPickerOpen, setColorPickerOpen] = useState(false)
  useFocusTrap(dialogRef, activeDialog !== null)

  const loadCatalog = useCallback(async (preferred?: {
    resourceTypeId?: string | null
    resourceId?: string | null
  }) => {
    setLoadStatus('loading')
    setError('')

    try {
      const [resourceTypeResult, resourceResult] = await Promise.all([
        Sfsures_resourcetypesService.getAll({
          select: [
            'sfsures_resourcetypeid',
            'sfsures_name',
            'sfsures_description',
            'sfsures_status',
          ],
          orderBy: ['sfsures_name asc'],
          top: 500,
        }),
        Sfsures_resourcesService.getAll({
          select: [
            'sfsures_resourceid',
            'sfsures_name',
            '_sfsures_resourcetype_value',
            'sfsures_location',
            'sfsures_description',
            'sfsures_calendarcolor',
            'sfsures_recordstatus',
          ],
          orderBy: ['sfsures_name asc'],
          top: 500,
        }),
      ])

      const loadedResourceTypes = ((resourceTypeResult.data ?? []) as Sfsures_resourcetypes[])
        .map((resourceType) => ({
          resourceTypeId: resourceType.sfsures_resourcetypeid,
          name: resourceType.sfsures_name,
          description: resourceType.sfsures_description ?? '',
          status: resourceType.sfsures_status ?? RESOURCE_TYPE_STATUS_ACTIVE,
        }))
        .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))

      const resourceTypesById = new Map(
        loadedResourceTypes.map((resourceType) => [
          resourceType.resourceTypeId,
          resourceType,
        ])
      )

      const loadedResources = ((resourceResult.data ?? []) as Sfsures_resources[])
        .map((resource) => {
          const resourceTypeId = resource._sfsures_resourcetype_value ?? ''
          const resourceType = resourceTypesById.get(resourceTypeId)

          return {
            resourceId: resource.sfsures_resourceid,
            name: resource.sfsures_name,
            resourceTypeId,
            resourceTypeName: resourceType?.name ?? 'Unassigned',
            location: resource.sfsures_location ?? '',
            description: resource.sfsures_description ?? '',
            calendarColor:
              resource.sfsures_calendarcolor ?? DEFAULT_RESOURCE_COLOR,
            recordStatus: resource.sfsures_recordstatus ?? RESOURCE_STATUS_ACTIVE,
          }
        })
        .sort((a, b) =>
          `${a.resourceTypeName}-${a.name}`.toLowerCase()
            .localeCompare(`${b.resourceTypeName}-${b.name}`.toLowerCase())
        )

      const preferredResourceTypeId =
        preferred?.resourceTypeId ?? selectedResourceTypeIdRef.current
      const nextResourceType =
        loadedResourceTypes.find(
          (resourceType) => resourceType.resourceTypeId === preferredResourceTypeId
        ) ??
        loadedResourceTypes[0] ??
        null
      const nextResourceTypeId = nextResourceType?.resourceTypeId ?? null

      const preferredResourceId = preferred?.resourceId ?? selectedResourceIdRef.current
      const nextResource =
        loadedResources.find((resource) => resource.resourceId === preferredResourceId) ??
        loadedResources[0] ??
        null
      const nextResourceId = nextResource?.resourceId ?? null

      selectedResourceTypeIdRef.current = nextResourceTypeId
      selectedResourceIdRef.current = nextResourceId
      setResourceTypes(loadedResourceTypes)
      setResources(loadedResources)
      setSelectedResourceTypeId(nextResourceTypeId)
      setSelectedResourceId(nextResourceId)
      setResourceTypeForm(resourceTypeFormFrom(nextResourceType))
      setResourceForm(resourceFormFrom(nextResource, nextResourceTypeId ?? ''))
      setLoadStatus('ready')
    } catch (err) {
      console.error('Resources admin load failed:', err)
      setError(err instanceof Error ? err.message : 'Resources could not be loaded.')
      setLoadStatus('error')
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => void loadCatalog(), 0)
    return () => window.clearTimeout(timer)
  }, [loadCatalog])

  useEffect(() => {
    if (!colorPickerOpen) return undefined

    function handlePointerDown(event: PointerEvent) {
      const target = event.target
      if (target instanceof Node && !colorPickerRef.current?.contains(target)) {
        setColorPickerOpen(false)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setColorPickerOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [colorPickerOpen])

  const selectedResourceType = useMemo(
    () =>
      resourceTypes.find((resourceType) => resourceType.resourceTypeId === selectedResourceTypeId) ??
      null,
    [resourceTypes, selectedResourceTypeId]
  )

  const selectedResource = useMemo(
    () => resources.find((resource) => resource.resourceId === selectedResourceId) ?? null,
    [resources, selectedResourceId]
  )

  const activeResourceTypes = useMemo(
    () =>
      resourceTypes.filter(
        (resourceType) => resourceType.status === RESOURCE_TYPE_STATUS_ACTIVE
      ),
    [resourceTypes]
  )

  const fallbackResourceTypeId = selectedResourceTypeId ?? activeResourceTypes[0]?.resourceTypeId ?? ''

  const filteredResourceTypes = useMemo(
    () =>
      resourceTypes.filter((resourceType) =>
        resourceTypeMatchesSearch(resourceType, resourceTypeSearch)
      ),
    [resourceTypeSearch, resourceTypes]
  )

  const filteredResources = useMemo(
    () => resources.filter((resource) => resourceMatchesSearch(resource, resourceSearch)),
    [resourceSearch, resources]
  )

  const activeResourceTypeCount = activeResourceTypes.length
  const activeResourceCount = resources.filter(
    (resource) => resource.recordStatus === RESOURCE_STATUS_ACTIVE
  ).length
  const selectedResourceColor =
    resourceColorByValue(resourceForm.calendarColor) ?? RESOURCE_COLOR_OPTIONS[0]
  const resourceTypeNameForForm =
    resourceTypes.find((resourceType) => resourceType.resourceTypeId === resourceForm.resourceTypeId)
      ?.name ?? ''

  function closeDialog() {
    setActiveDialog(null)
    setModalError('')
    setColorPickerOpen(false)
  }

  function openCreateResourceTypeDialog() {
    setResourceTypeForm(EMPTY_RESOURCE_TYPE_FORM)
    setActiveDialog({ kind: 'resourceType', mode: 'create' })
    setModalError('')
    setStatus('')
  }

  function openEditResourceTypeDialog() {
    if (!selectedResourceType) return
    setResourceTypeForm(resourceTypeFormFrom(selectedResourceType))
    setActiveDialog({ kind: 'resourceType', mode: 'edit' })
    setModalError('')
    setStatus('')
  }

  function openCreateResourceDialog() {
    setResourceForm(emptyResourceForm(fallbackResourceTypeId))
    setActiveDialog({ kind: 'resource', mode: 'create' })
    setModalError('')
    setStatus('')
  }

  function openEditResourceDialog() {
    if (!selectedResource) return
    setResourceForm(resourceFormFrom(selectedResource, fallbackResourceTypeId))
    setActiveDialog({ kind: 'resource', mode: 'edit' })
    setModalError('')
    setColorPickerOpen(false)
    setStatus('')
  }

  function selectResourceType(resourceType: AdminResourceType) {
    selectedResourceTypeIdRef.current = resourceType.resourceTypeId
    setSelectedResourceTypeId(resourceType.resourceTypeId)
    setError('')
    setStatus('')
  }

  function selectResource(resource: AdminResource) {
    selectedResourceIdRef.current = resource.resourceId
    setSelectedResourceId(resource.resourceId)
    setError('')
    setStatus('')
  }

  function selectCalendarColor(calendarColor: Sfsures_resourcessfsures_calendarcolor) {
    setResourceForm((current) => ({
      ...current,
      calendarColor,
    }))
    setColorPickerOpen(false)
  }

  function handleColorPickerButtonKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setColorPickerOpen(true)
    }
  }

  function handleDialogKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Escape') return

    event.preventDefault()
    if (colorPickerOpen) {
      setColorPickerOpen(false)
      return
    }

    closeDialog()
  }

  async function handleSaveResourceType(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const name = resourceTypeForm.name.trim()
    const description = resourceTypeForm.description.trim()

    if (!name) {
      setModalError('Enter a resource type name.')
      return
    }

    setSavingResourceType(true)
    setModalError('')
    setStatus('')

    try {
      let auditWritten = true
      if (resourceTypeForm.id) {
        const beforeResourceType = selectedResourceType
        await Sfsures_resourcetypesService.update(resourceTypeForm.id, {
          sfsures_name: name,
          sfsures_description: description || null,
        } as unknown as Parameters<typeof Sfsures_resourcetypesService.update>[1])

        auditWritten = await writeAuditLog({
          actor: currentUser,
          actionType: AUDIT_ACTION_TYPES.resourceCatalogEdited,
          targetType: AUDIT_TARGET_TYPES.resource,
          targetId: resourceTypeForm.id,
          targetKey: `resource-type:${resourceTypeForm.id}`,
          targetLabel: name,
          beforeState: beforeResourceType ? resourceTypeSnapshot(beforeResourceType) : undefined,
          afterState: {
            ...resourceTypeSnapshot(resourceTypeForm),
            status: beforeResourceType?.status ?? RESOURCE_TYPE_STATUS_ACTIVE,
          },
          details: {
            source: 'Admin Resources screen',
            catalogEntity: 'Resource Type',
            operation: 'update',
          },
        })
        setStatus(
          auditWritten
            ? 'Resource type saved.'
            : 'Resource type saved. Audit log could not be written.'
        )
        await loadCatalog({ resourceTypeId: resourceTypeForm.id })
      } else {
        const created = await Sfsures_resourcetypesService.create({
          sfsures_name: name,
          sfsures_description: description || undefined,
          sfsures_status: RESOURCE_TYPE_STATUS_ACTIVE,
          statecode: 0,
          statuscode: 1,
        } as unknown as Parameters<typeof Sfsures_resourcetypesService.create>[0])

        const createdId = created.data?.sfsures_resourcetypeid ?? null
        auditWritten = await writeAuditLog({
          actor: currentUser,
          actionType: AUDIT_ACTION_TYPES.resourceCatalogEdited,
          targetType: AUDIT_TARGET_TYPES.resource,
          targetId: createdId ?? undefined,
          targetKey: createdId ? `resource-type:${createdId}` : undefined,
          targetLabel: name,
          afterState: {
            resourceTypeId: createdId,
            name,
            description: description || null,
            status: RESOURCE_TYPE_STATUS_ACTIVE,
          },
          details: {
            source: 'Admin Resources screen',
            catalogEntity: 'Resource Type',
            operation: 'create',
          },
        })
        setStatus(
          auditWritten
            ? 'Resource type created.'
            : 'Resource type created. Audit log could not be written.'
        )
        await loadCatalog({ resourceTypeId: createdId })
      }

      closeDialog()
    } catch (err) {
      console.error('Save resource type failed:', err)
      setModalError(err instanceof Error ? err.message : 'Resource type could not be saved.')
    } finally {
      setSavingResourceType(false)
    }
  }

  async function handleToggleResourceTypeStatus() {
    if (!selectedResourceType) return

    const nextStatus =
      selectedResourceType.status === RESOURCE_TYPE_STATUS_INACTIVE
        ? RESOURCE_TYPE_STATUS_ACTIVE
        : RESOURCE_TYPE_STATUS_INACTIVE

    setSavingResourceType(true)
    setModalError('')
    setStatus('')

    try {
      await Sfsures_resourcetypesService.update(selectedResourceType.resourceTypeId, {
        sfsures_status: nextStatus,
      } as unknown as Parameters<typeof Sfsures_resourcetypesService.update>[1])

      const auditWritten = await writeAuditLog({
        actor: currentUser,
        actionType: AUDIT_ACTION_TYPES.resourceCatalogEdited,
        targetType: AUDIT_TARGET_TYPES.resource,
        targetId: selectedResourceType.resourceTypeId,
        targetKey: `resource-type:${selectedResourceType.resourceTypeId}`,
        targetLabel: selectedResourceType.name,
        beforeState: resourceTypeSnapshot(selectedResourceType),
        afterState: {
          ...resourceTypeSnapshot(selectedResourceType),
          status: nextStatus,
        },
        details: {
          source: 'Admin Resources screen',
          catalogEntity: 'Resource Type',
          operation: nextStatus === RESOURCE_TYPE_STATUS_ACTIVE ? 'reactivate' : 'deactivate',
        },
      })

      setStatus(
        auditWritten
          ? nextStatus === RESOURCE_TYPE_STATUS_ACTIVE
            ? 'Resource type reactivated.'
            : 'Resource type set inactive.'
          : nextStatus === RESOURCE_TYPE_STATUS_ACTIVE
            ? 'Resource type reactivated. Audit log could not be written.'
            : 'Resource type set inactive. Audit log could not be written.'
      )
      await loadCatalog({ resourceTypeId: selectedResourceType.resourceTypeId })
      closeDialog()
    } catch (err) {
      console.error('Update resource type status failed:', err)
      setModalError(
        err instanceof Error ? err.message : 'Resource type status could not be changed.'
      )
    } finally {
      setSavingResourceType(false)
    }
  }

  async function handleSaveResource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const name = resourceForm.name.trim()
    const resourceTypeId = resourceForm.resourceTypeId
    const location = resourceForm.location.trim()
    const description = resourceForm.description.trim()

    if (!name) {
      setModalError('Enter a resource name.')
      return
    }

    if (!resourceTypeId) {
      setModalError('Select a resource type before saving a resource.')
      return
    }

    setSavingResource(true)
    setModalError('')
    setStatus('')

    try {
      let auditWritten = true
      if (resourceForm.id) {
        const beforeResource = selectedResource
        await Sfsures_resourcesService.update(resourceForm.id, {
          sfsures_name: name,
          'sfsures_ResourceType@odata.bind': `/sfsures_resourcetypes(${resourceTypeId})`,
          sfsures_location: location || null,
          sfsures_description: description || null,
          sfsures_calendarcolor: resourceForm.calendarColor,
        } as unknown as Parameters<typeof Sfsures_resourcesService.update>[1])

        auditWritten = await writeAuditLog({
          actor: currentUser,
          actionType: AUDIT_ACTION_TYPES.resourceCatalogEdited,
          targetType: AUDIT_TARGET_TYPES.resource,
          targetId: resourceForm.id,
          targetLabel: name,
          beforeState: beforeResource ? resourceSnapshot(beforeResource) : undefined,
          afterState: {
            ...resourceSnapshot(
              {
                ...resourceForm,
                name,
                location,
                description,
              },
              resourceTypeNameForForm
            ),
            recordStatus: beforeResource?.recordStatus ?? RESOURCE_STATUS_ACTIVE,
          },
          details: {
            source: 'Admin Resources screen',
            catalogEntity: 'Resource',
            operation: 'update',
          },
        })
        setStatus(
          auditWritten ? 'Resource saved.' : 'Resource saved. Audit log could not be written.'
        )
        await loadCatalog({ resourceId: resourceForm.id })
      } else {
        const created = await Sfsures_resourcesService.create({
          sfsures_name: name,
          'sfsures_ResourceType@odata.bind': `/sfsures_resourcetypes(${resourceTypeId})`,
          sfsures_location: location || undefined,
          sfsures_description: description || undefined,
          sfsures_calendarcolor: resourceForm.calendarColor,
          sfsures_recordstatus: RESOURCE_STATUS_ACTIVE,
          statecode: 0,
          statuscode: 1,
        } as unknown as Parameters<typeof Sfsures_resourcesService.create>[0])

        const createdId = created.data?.sfsures_resourceid ?? null
        auditWritten = await writeAuditLog({
          actor: currentUser,
          actionType: AUDIT_ACTION_TYPES.resourceCatalogEdited,
          targetType: AUDIT_TARGET_TYPES.resource,
          targetId: createdId ?? undefined,
          targetLabel: name,
          afterState: {
            resourceId: createdId,
            name,
            resourceTypeId,
            resourceTypeName: resourceTypeNameForForm,
            location: location || null,
            description: description || null,
            calendarColor: resourceForm.calendarColor,
            calendarColorName: selectedResourceColor?.label ?? null,
            recordStatus: RESOURCE_STATUS_ACTIVE,
          },
          details: {
            source: 'Admin Resources screen',
            catalogEntity: 'Resource',
            operation: 'create',
          },
        })
        setStatus(
          auditWritten ? 'Resource created.' : 'Resource created. Audit log could not be written.'
        )
        await loadCatalog({ resourceId: createdId })
      }

      closeDialog()
    } catch (err) {
      console.error('Save resource failed:', err)
      setModalError(err instanceof Error ? err.message : 'Resource could not be saved.')
    } finally {
      setSavingResource(false)
    }
  }

  async function handleToggleResourceStatus() {
    if (!selectedResource) return

    const nextStatus =
      selectedResource.recordStatus === RESOURCE_STATUS_DISABLED
        ? RESOURCE_STATUS_ACTIVE
        : RESOURCE_STATUS_DISABLED

    setSavingResource(true)
    setModalError('')
    setStatus('')

    try {
      await Sfsures_resourcesService.update(selectedResource.resourceId, {
        sfsures_recordstatus: nextStatus,
      } as unknown as Parameters<typeof Sfsures_resourcesService.update>[1])

      const auditWritten = await writeAuditLog({
        actor: currentUser,
        actionType: AUDIT_ACTION_TYPES.resourceCatalogEdited,
        targetType: AUDIT_TARGET_TYPES.resource,
        targetId: selectedResource.resourceId,
        targetLabel: selectedResource.name,
        beforeState: resourceSnapshot(selectedResource),
        afterState: {
          ...resourceSnapshot(selectedResource),
          recordStatus: nextStatus,
        },
        details: {
          source: 'Admin Resources screen',
          catalogEntity: 'Resource',
          operation: nextStatus === RESOURCE_STATUS_ACTIVE ? 'reactivate' : 'disable',
        },
      })

      setStatus(
        auditWritten
          ? nextStatus === RESOURCE_STATUS_ACTIVE
            ? 'Resource reactivated.'
            : 'Resource disabled.'
          : nextStatus === RESOURCE_STATUS_ACTIVE
            ? 'Resource reactivated. Audit log could not be written.'
            : 'Resource disabled. Audit log could not be written.'
      )
      await loadCatalog({ resourceId: selectedResource.resourceId })
      closeDialog()
    } catch (err) {
      console.error('Update resource status failed:', err)
      setModalError(err instanceof Error ? err.message : 'Resource status could not be changed.')
    } finally {
      setSavingResource(false)
    }
  }

  if (loadStatus === 'loading') {
    return (
      <section className={styles.settingsPanel} aria-busy="true">
        <div className={styles.panelToolbar}>
          <h2>Resources</h2>
        </div>
        <div className={styles.inlineLoading} role="status">
          Loading resources...
        </div>
      </section>
    )
  }

  return (
    <section className={styles.settingsPanel}>
      <div className={styles.panelToolbar}>
        <div>
          <h2>Resources</h2>
          <p className={styles.panelMeta}>
            {activeResourceTypeCount} Active Types / {activeResourceCount} Active Resources
          </p>
        </div>
        <div className={styles.panelActions}>
          <button type="button" className={styles.secondaryButton} onClick={() => void loadCatalog()}>
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <p className={styles.errorBanner} role="alert">
          {error}
        </p>
      )}

      {status && (
        <p className={styles.statusBanner} role="status">
          {status}
        </p>
      )}

      {loadStatus === 'error' ? (
        <button type="button" className={styles.primaryButton} onClick={() => void loadCatalog()}>
          Retry
        </button>
      ) : (
        <div className={styles.catalogStack}>
          <section className={styles.formSection} aria-labelledby="resource-types-heading">
            <div className={styles.sectionHeader}>
              <h3 id="resource-types-heading">Resource Types</h3>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={openCreateResourceTypeDialog}
              >
                New Type
              </button>
            </div>

            <div className={styles.catalogAdminGrid}>
              <div className={styles.catalogListPane}>
                <label className={styles.field}>
                  <span>Search resource types</span>
                  <input
                    className={styles.input}
                    value={resourceTypeSearch}
                    onChange={(event) => setResourceTypeSearch(event.target.value)}
                  />
                </label>

                <div className={styles.catalogList} role="list" aria-label="Resource Types">
                  {filteredResourceTypes.length === 0 ? (
                    <p className={styles.emptyState}>No resource types found.</p>
                  ) : (
                    filteredResourceTypes.map((resourceType) => (
                      <button
                        key={resourceType.resourceTypeId}
                        type="button"
                        className={
                          selectedResourceTypeId === resourceType.resourceTypeId
                            ? `${styles.catalogListItem} ${styles.catalogListItemActive}`
                            : styles.catalogListItem
                        }
                        onClick={() => selectResourceType(resourceType)}
                      >
                        <span className={styles.catalogListName}>{resourceType.name}</span>
                        {resourceType.description && (
                          <span className={styles.catalogListMeta}>
                            {resourceType.description}
                          </span>
                        )}
                        <span
                          className={
                            resourceType.status === RESOURCE_TYPE_STATUS_INACTIVE
                              ? `${styles.statusPill} ${styles.statusPillDisabled}`
                              : styles.statusPill
                          }
                        >
                          {resourceType.status === RESOURCE_TYPE_STATUS_INACTIVE
                            ? 'Inactive'
                            : 'Active'}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>

              <div className={styles.catalogDetailPane}>
                {selectedResourceType ? (
                  <>
                    <div className={styles.userDetailHeader}>
                      <div>
                        <p className={styles.detailLabel}>Resource Type</p>
                        <h3>{selectedResourceType.name}</h3>
                      </div>
                      <span
                        className={
                          selectedResourceType.status === RESOURCE_TYPE_STATUS_INACTIVE
                            ? `${styles.statusPill} ${styles.statusPillDisabled}`
                            : styles.statusPill
                        }
                      >
                        {selectedResourceType.status === RESOURCE_TYPE_STATUS_INACTIVE
                          ? 'Inactive'
                          : 'Active'}
                      </span>
                    </div>

                    <dl className={styles.detailList}>
                      <div>
                        <dt>Resources</dt>
                        <dd>
                          {
                            resources.filter(
                              (resource) =>
                                resource.resourceTypeId === selectedResourceType.resourceTypeId
                            ).length
                          }
                        </dd>
                      </div>
                      <div>
                        <dt>Status</dt>
                        <dd>
                          {selectedResourceType.status === RESOURCE_TYPE_STATUS_INACTIVE
                            ? 'Inactive'
                            : 'Active'}
                        </dd>
                      </div>
                    </dl>

                    {selectedResourceType.description && (
                      <p className={styles.groupDescription}>{selectedResourceType.description}</p>
                    )}

                    <div className={styles.detailActions}>
                      <button
                        type="button"
                        className={styles.primaryButton}
                        onClick={openEditResourceTypeDialog}
                      >
                        Edit Type
                      </button>
                    </div>
                  </>
                ) : (
                  <p className={styles.emptyState}>No resource type selected.</p>
                )}
              </div>
            </div>
          </section>

          <section
            className={`${styles.formSection} ${styles.catalogSectionDivider}`}
            aria-labelledby="resources-heading"
          >
            <div className={styles.sectionHeader}>
              <h3 id="resources-heading">Resources</h3>
              <button
                type="button"
                className={styles.primaryButton}
                disabled={resourceTypes.length === 0}
                onClick={openCreateResourceDialog}
              >
                New Resource
              </button>
            </div>

            {resourceTypes.length === 0 && (
              <p className={styles.emptyState}>Create a Resource Type before adding resources.</p>
            )}

            <div className={styles.catalogAdminGrid}>
              <div className={styles.catalogListPane}>
                <label className={styles.field}>
                  <span>Search resources</span>
                  <input
                    className={styles.input}
                    value={resourceSearch}
                    onChange={(event) => setResourceSearch(event.target.value)}
                  />
                </label>

                <div className={styles.catalogList} role="list" aria-label="Resources">
                  {filteredResources.length === 0 ? (
                    <p className={styles.emptyState}>No resources found.</p>
                  ) : (
                    filteredResources.map((resource) => {
                      const color = resourceColorByValue(resource.calendarColor)

                      return (
                        <button
                          key={resource.resourceId}
                          type="button"
                          className={
                            selectedResourceId === resource.resourceId
                              ? `${styles.catalogListItem} ${styles.catalogListItemActive}`
                              : styles.catalogListItem
                          }
                          onClick={() => selectResource(resource)}
                        >
                          <span className={styles.catalogListHeading}>
                            <span
                              className={styles.catalogColorDot}
                              style={{ backgroundColor: color?.backgroundColor }}
                              aria-hidden="true"
                            />
                            <span className={styles.catalogListName}>{resource.name}</span>
                          </span>
                          <span className={styles.catalogListMeta}>
                            {resource.resourceTypeName}
                            {resource.location ? ` / ${resource.location}` : ''}
                          </span>
                          <span
                            className={
                              resource.recordStatus === RESOURCE_STATUS_DISABLED
                                ? `${styles.statusPill} ${styles.statusPillDisabled}`
                                : styles.statusPill
                            }
                          >
                            {resource.recordStatus === RESOURCE_STATUS_DISABLED
                              ? 'Disabled'
                              : 'Active'}
                          </span>
                        </button>
                      )
                    })
                  )}
                </div>
              </div>

              <div className={styles.catalogDetailPane}>
                {selectedResource ? (
                  <>
                    <div className={styles.userDetailHeader}>
                      <div>
                        <p className={styles.detailLabel}>Resource</p>
                        <h3>{selectedResource.name}</h3>
                      </div>
                      <span
                        className={
                          selectedResource.recordStatus === RESOURCE_STATUS_DISABLED
                            ? `${styles.statusPill} ${styles.statusPillDisabled}`
                            : styles.statusPill
                        }
                      >
                        {selectedResource.recordStatus === RESOURCE_STATUS_DISABLED
                          ? 'Disabled'
                          : 'Active'}
                      </span>
                    </div>

                    <dl className={styles.detailList}>
                      <div>
                        <dt>Type</dt>
                        <dd>{selectedResource.resourceTypeName}</dd>
                      </div>
                      <div>
                        <dt>Location</dt>
                        <dd>{selectedResource.location || 'Unavailable'}</dd>
                      </div>
                      <div>
                        <dt>Color</dt>
                        <dd>{resourceColorByValue(selectedResource.calendarColor)?.label ?? 'Default'}</dd>
                      </div>
                    </dl>

                    {selectedResource.description && (
                      <p className={styles.groupDescription}>{selectedResource.description}</p>
                    )}

                    <div className={styles.detailActions}>
                      <button
                        type="button"
                        className={styles.primaryButton}
                        onClick={openEditResourceDialog}
                      >
                        Edit Resource
                      </button>
                    </div>
                  </>
                ) : (
                  <p className={styles.emptyState}>No resource selected.</p>
                )}
              </div>
            </div>
          </section>
        </div>
      )}

      {activeDialog && (
        <div className={styles.modalBackdrop}>
          <div
            ref={dialogRef}
            className={
              activeDialog.kind === 'resource' && colorPickerOpen
                ? `${styles.adminModal} ${styles.adminModalColorExpanded}`
                : styles.adminModal
            }
            role="dialog"
            aria-modal="true"
            aria-labelledby={dialogTitleId}
            tabIndex={-1}
            onKeyDown={handleDialogKeyDown}
          >
            <form
              className={styles.modalForm}
              onSubmit={
                activeDialog.kind === 'resourceType'
                  ? handleSaveResourceType
                  : handleSaveResource
              }
            >
              <header className={styles.modalHeader}>
                <div>
                  <p className={styles.detailLabel}>
                    {activeDialog.kind === 'resourceType' ? 'Resource Type' : 'Resource'}
                  </p>
                  <h2 id={dialogTitleId}>
                    {activeDialog.mode === 'create'
                      ? activeDialog.kind === 'resourceType'
                        ? 'Create Resource Type'
                        : 'Create Resource'
                      : activeDialog.kind === 'resourceType'
                        ? 'Edit Resource Type'
                        : 'Edit Resource'}
                  </h2>
                </div>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  disabled={savingResourceType || savingResource}
                  onClick={closeDialog}
                >
                  Close
                </button>
              </header>

              {modalError && (
                <p className={styles.errorBanner} role="alert">
                  {modalError}
                </p>
              )}

              {activeDialog.kind === 'resourceType' ? (
                <div className={styles.modalBody}>
                  <label className={styles.field}>
                    <span>Name</span>
                    <input
                      className={styles.input}
                      value={resourceTypeForm.name}
                      onChange={(event) =>
                        setResourceTypeForm((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                    />
                  </label>

                  <label className={styles.field}>
                    <span>Description</span>
                    <textarea
                      className={styles.textarea}
                      rows={4}
                      value={resourceTypeForm.description}
                      onChange={(event) =>
                        setResourceTypeForm((current) => ({
                          ...current,
                          description: event.target.value,
                        }))
                      }
                    />
                  </label>
                </div>
              ) : (
                <div className={styles.modalBody}>
                  <label className={styles.field}>
                    <span>Name</span>
                    <input
                      className={styles.input}
                      value={resourceForm.name}
                      onChange={(event) =>
                        setResourceForm((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                    />
                  </label>

                  <label className={styles.field}>
                    <span>Resource type</span>
                    <select
                      className={styles.input}
                      value={resourceForm.resourceTypeId}
                      disabled={resourceTypes.length === 0}
                      onChange={(event) =>
                        setResourceForm((current) => ({
                          ...current,
                          resourceTypeId: event.target.value,
                        }))
                      }
                    >
                      <option value="">Select type</option>
                      {resourceTypes.map((resourceType) => (
                        <option
                          key={resourceType.resourceTypeId}
                          value={resourceType.resourceTypeId}
                        >
                          {resourceType.name}
                          {resourceType.status === RESOURCE_TYPE_STATUS_INACTIVE
                            ? ' (Inactive)'
                            : ''}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className={styles.field}>
                    <span>Location</span>
                    <input
                      className={styles.input}
                      value={resourceForm.location}
                      onChange={(event) =>
                        setResourceForm((current) => ({
                          ...current,
                          location: event.target.value,
                        }))
                      }
                    />
                  </label>

                  <label className={styles.field}>
                    <span>Description</span>
                    <textarea
                      className={styles.textarea}
                      rows={4}
                      value={resourceForm.description}
                      onChange={(event) =>
                        setResourceForm((current) => ({
                          ...current,
                          description: event.target.value,
                        }))
                      }
                    />
                  </label>

                  <div className={styles.field}>
                    <span id={colorPickerLabelId}>Calendar color</span>
                    <div className={styles.colorSelectControl} ref={colorPickerRef}>
                      <button
                        type="button"
                        className={styles.colorSelectButton}
                        aria-haspopup="listbox"
                        aria-expanded={colorPickerOpen}
                        aria-controls={colorPickerListboxId}
                        aria-labelledby={`${colorPickerLabelId} ${colorPickerId}-value`}
                        onClick={() => setColorPickerOpen((open) => !open)}
                        onKeyDown={handleColorPickerButtonKeyDown}
                      >
                        <span
                          id={`${colorPickerId}-value`}
                          className={styles.colorSelectButtonText}
                        >
                          <span
                            className={styles.resourceColorSwatch}
                            style={{
                              backgroundColor: selectedResourceColor.backgroundColor,
                              color: selectedResourceColor.textColor,
                            }}
                            aria-hidden="true"
                          >
                            Aa
                          </span>
                          <span className={styles.colorSelectLabel}>
                            {selectedResourceColor.label}
                          </span>
                        </span>
                        <span className={styles.colorSelectChevron} aria-hidden="true">
                          v
                        </span>
                      </button>

                      {colorPickerOpen && (
                        <div
                          className={styles.colorSelectList}
                          id={colorPickerListboxId}
                          role="listbox"
                          aria-labelledby={colorPickerLabelId}
                        >
                          {RESOURCE_COLOR_OPTIONS.map((color) => {
                            const selected = color.value === resourceForm.calendarColor

                            return (
                              <button
                                key={color.value}
                                type="button"
                                role="option"
                                aria-selected={selected}
                                className={
                                  selected
                                    ? `${styles.colorSelectOption} ${styles.colorSelectOptionActive}`
                                    : styles.colorSelectOption
                                }
                                onClick={() => selectCalendarColor(color.value)}
                              >
                                <span
                                  className={styles.resourceColorSwatch}
                                  style={{
                                    backgroundColor: color.backgroundColor,
                                    color: color.textColor,
                                  }}
                                  aria-hidden="true"
                                >
                                  Aa
                                </span>
                                <span className={styles.colorSelectLabel}>{color.label}</span>
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <footer className={styles.modalFooter}>
                <div className={styles.modalFooterStatus}>
                  {activeDialog.mode === 'edit' && activeDialog.kind === 'resourceType' && (
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      disabled={savingResourceType}
                      onClick={() => void handleToggleResourceTypeStatus()}
                    >
                      {selectedResourceType?.status === RESOURCE_TYPE_STATUS_INACTIVE
                        ? 'Reactivate Type'
                        : 'Set Inactive'}
                    </button>
                  )}
                  {activeDialog.mode === 'edit' && activeDialog.kind === 'resource' && (
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      disabled={savingResource}
                      onClick={() => void handleToggleResourceStatus()}
                    >
                      {selectedResource?.recordStatus === RESOURCE_STATUS_DISABLED
                        ? 'Reactivate Resource'
                        : 'Disable Resource'}
                    </button>
                  )}
                </div>

                <div className={styles.modalFooterActions}>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    disabled={savingResourceType || savingResource}
                    onClick={closeDialog}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className={styles.primaryButton}
                    disabled={savingResourceType || savingResource}
                  >
                    {savingResourceType || savingResource
                      ? 'Saving...'
                      : activeDialog.mode === 'create'
                        ? activeDialog.kind === 'resourceType'
                          ? 'Create Type'
                          : 'Create Resource'
                        : activeDialog.kind === 'resourceType'
                          ? 'Save Type'
                          : 'Save Resource'}
                  </button>
                </div>
              </footer>
            </form>
          </div>
        </div>
      )}
    </section>
  )
}
