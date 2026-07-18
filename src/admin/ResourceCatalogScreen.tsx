import {
  useCallback,
  useEffect,
  useId,
  lazy,
  useMemo,
  useRef,
  Suspense,
  useState,
  type ChangeEvent,
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
import type { Sfsures_attributedefinitions } from '../generated/models/Sfsures_attributedefinitionsModel'
import type { Sfsures_resourceattributevalues } from '../generated/models/Sfsures_resourceattributevaluesModel'
import type { Sfsures_reservationattributevalues } from '../generated/models/Sfsures_reservationattributevaluesModel'
import { Sfsures_resourcesService } from '../generated/services/Sfsures_resourcesService'
import { Sfsures_resourcetypesService } from '../generated/services/Sfsures_resourcetypesService'
import { Sfsures_attributedefinitionsService } from '../generated/services/Sfsures_attributedefinitionsService'
import { Sfsures_resourceattributevaluesService } from '../generated/services/Sfsures_resourceattributevaluesService'
import { Sfsures_reservationattributevaluesService } from '../generated/services/Sfsures_reservationattributevaluesService'
import {
  RESOURCE_COLOR_OPTIONS,
  resourceColorByValue,
} from '../theme/resourceColors'
import { useFocusTrap } from '../a11y/useFocusTrap'
import styles from './AdminApp.module.css'

const ResourcePhotoCropper = lazy(() => import('./ResourcePhotoCropper'))

export type ResourceCatalogMode = 'resourceTypes' | 'resources'

interface ResourceCatalogScreenProps {
  mode: ResourceCatalogMode
}

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
  resourceTypeStatus: number | null
  location: string
  description: string
  calendarColor: Sfsures_resourcessfsures_calendarcolor
  recordStatus: number
  photoThumbnailUrl: string | null
}

interface AttributeDefinition {
  id: string
  resourceTypeId: string
  resourceId: string
  name: string
  dataType: number
  appliesTo: number
  required: boolean
  choiceOptions: string[]
  displayOrder: number
}

interface AttributeValue {
  id: string
  resourceId: string
  definitionId: string
  value: string
}

interface AttributeDefinitionForm {
  id: string | null
  name: string
  dataType: number
  required: boolean
  choiceOptions: string
  displayOrder: string
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

type AttributeDefinitionKind = 'resourceAttribute' | 'customField'

interface AttributeDefinitionDialog {
  kind: AttributeDefinitionKind
  scope: 'resourceType' | 'resource'
  resourceTypeId: string
  resourceId?: string
}

interface PendingAttributeDelete {
  definition: AttributeDefinition
  dialog: AttributeDefinitionDialog
}

interface PendingResourcePhoto {
  file: File
  byteSize: number
  previewUrl: string
}

interface ResourcePhotoInfo {
  photoThumbnailUrl: string | null
}

interface PhotoCropSource {
  dataUrl: string
}

const RESOURCE_TYPE_STATUS_ACTIVE = 997330000
const RESOURCE_TYPE_STATUS_INACTIVE = 997330001
const RESOURCE_STATUS_ACTIVE = 997330000
const RESOURCE_STATUS_DISABLED = 997330001
const ATTRIBUTE_APPLIES_TO_RESOURCE = 997330000
const ATTRIBUTE_APPLIES_TO_RESERVATION = 997330001
const ATTRIBUTE_TYPE_TEXT = 997330000
const ATTRIBUTE_TYPE_CHOICE = 997330004
const DEFAULT_RESOURCE_COLOR = RESOURCE_COLOR_OPTIONS[0].value
const RESOURCE_PHOTO_COLUMN = 'sfsures_resourcephoto'
const RESOURCE_PHOTO_ACCEPT = '.jpg,.jpeg,.png,.gif,.bmp,image/jpeg,image/png,image/gif,image/bmp'
const RESOURCE_PHOTO_MAX_BYTES = 10 * 1024 * 1024
const SUPPORTED_RESOURCE_PHOTO_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/bmp',
])

const EMPTY_RESOURCE_TYPE_FORM: ResourceTypeForm = {
  id: null,
  name: '',
  description: '',
}

const EMPTY_ATTRIBUTE_FORM: AttributeDefinitionForm = {
  id: null,
  name: '',
  dataType: ATTRIBUTE_TYPE_TEXT,
  required: false,
  choiceOptions: '',
  displayOrder: '10',
}

function attributeValueText(row: Sfsures_resourceattributevalues): string {
  if (row.sfsures_valuetext != null) return row.sfsures_valuetext
  if (row.sfsures_valuechoice != null) return row.sfsures_valuechoice
  if (row.sfsures_valuenumber != null) return String(row.sfsures_valuenumber)
  if (row.sfsures_valuedatetime != null) return row.sfsures_valuedatetime
  if (row.sfsures_valueboolean != null) return row.sfsures_valueboolean ? 'Yes' : 'No'
  return ''
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

function isResourceTypeActive(status: number | null | undefined): boolean {
  return status === RESOURCE_TYPE_STATUS_ACTIVE
}

function isResourceReservable(
  resource: Pick<AdminResource, 'recordStatus' | 'resourceTypeStatus'>
): boolean {
  return (
    resource.recordStatus === RESOURCE_STATUS_ACTIVE &&
    isResourceTypeActive(resource.resourceTypeStatus)
  )
}

function resourceStatusPill(resource: AdminResource): { className: string; label: string } {
  if (resource.recordStatus === RESOURCE_STATUS_DISABLED) {
    return { className: `${styles.statusPill} ${styles.statusPillDisabled}`, label: 'Disabled' }
  }

  if (!isResourceTypeActive(resource.resourceTypeStatus)) {
    return {
      className: `${styles.statusPill} ${styles.statusPillWarning}`,
      label: 'Active, Type Inactive',
    }
  }

  return { className: styles.statusPill, label: 'Active' }
}

function resourceReservableLabel(resource: AdminResource): string {
  if (isResourceReservable(resource)) {
    return 'Yes'
  }

  if (resource.recordStatus === RESOURCE_STATUS_DISABLED) {
    return 'No - resource disabled'
  }

  if (!isResourceTypeActive(resource.resourceTypeStatus)) {
    return 'No - resource type inactive'
  }

  return 'No'
}

function resourcePhotoThumbnailSrc(value: unknown): string | null {
  const base64 = typeof value === 'string' ? value.trim() : ''
  if (!base64) return null

  if (base64.startsWith('data:')) {
    return base64
  }

  return `data:image/jpeg;base64,${base64}`
}

async function loadResourcePhotoMap(): Promise<Map<string, ResourcePhotoInfo>> {
  try {
    const result = await Sfsures_resourcesService.getAll({
      select: ['sfsures_resourceid', RESOURCE_PHOTO_COLUMN],
      orderBy: ['sfsures_name asc'],
      top: 500,
    })

    return new Map(
      ((result.data ?? []) as Array<Sfsures_resources & Record<string, unknown>>).map(
        (resource) => [
          resource.sfsures_resourceid,
          {
            photoThumbnailUrl: resourcePhotoThumbnailSrc(resource[RESOURCE_PHOTO_COLUMN]),
          },
        ]
      )
    )
  } catch (err) {
    console.warn('Resource photo fields could not be loaded:', err)
    return new Map()
  }
}

function formatBytes(bytes: number): string {
  const megabytes = bytes / (1024 * 1024)
  return `${megabytes.toFixed(megabytes >= 10 ? 0 : 1)} MB`
}

function isSupportedResourcePhoto(file: File): boolean {
  if (SUPPORTED_RESOURCE_PHOTO_TYPES.has(file.type)) {
    return true
  }

  return /\.(jpe?g|png|gif|bmp)$/i.test(file.name)
}

function readImageAsDataUrl(image: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
        return
      }

      reject(new Error('The selected image could not be prepared.'))
    }
    reader.onerror = () => reject(new Error('The selected image could not be read.'))
    reader.onabort = () => reject(new Error('Reading the selected image was canceled.'))
    reader.readAsDataURL(image)
  })
}

function resourcePhotoMimeType(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'image/png'
  }
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'image/gif'
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) return 'image/bmp'
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp'
  }

  return 'image/jpeg'
}

function resourcePhotoBytesAsDataUrl(bytes: Uint8Array): Promise<string> {
  const copiedBytes = Uint8Array.from(bytes)
  return readImageAsDataUrl(
    new Blob([copiedBytes.buffer], { type: resourcePhotoMimeType(copiedBytes) })
  )
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
    resourceTypeStatus: 'resourceTypeStatus' in resource ? resource.resourceTypeStatus : undefined,
    location: resource.location || null,
    description: resource.description || null,
    calendarColor: resource.calendarColor,
    calendarColorName: color?.label ?? null,
    recordStatus: 'recordStatus' in resource ? resource.recordStatus : RESOURCE_STATUS_ACTIVE,
    reservable:
      'recordStatus' in resource && 'resourceTypeStatus' in resource
        ? isResourceReservable(resource)
        : undefined,
  }
}

export function ResourceCatalogScreen({ mode }: ResourceCatalogScreenProps) {
  const currentUser = useCurrentUser()
  const colorPickerId = useId()
  const colorPickerLabelId = `${colorPickerId}-label`
  const colorPickerListboxId = `${colorPickerId}-listbox`
  const dialogTitleId = `${colorPickerId}-dialog-title`
  const resourceListDialogTitleId = `${colorPickerId}-resource-list-title`
  const resourcePhotoPreviewTitleId = `${colorPickerId}-photo-preview-title`
  const [resourceTypes, setResourceTypes] = useState<AdminResourceType[]>([])
  const [resources, setResources] = useState<AdminResource[]>([])
  const [attributeDefinitions, setAttributeDefinitions] = useState<AttributeDefinition[]>([])
  const [attributeValues, setAttributeValues] = useState<AttributeValue[]>([])
  const [attributeForm, setAttributeForm] = useState<AttributeDefinitionForm>(EMPTY_ATTRIBUTE_FORM)
  const [resourceAttributeDraft, setResourceAttributeDraft] = useState<Record<string, string>>({})
  const [attributeDefinitionDialog, setAttributeDefinitionDialog] =
    useState<AttributeDefinitionDialog | null>(null)
  const [pendingAttributeDelete, setPendingAttributeDelete] =
    useState<PendingAttributeDelete | null>(null)
  const [savingAttribute, setSavingAttribute] = useState(false)
  const [savingAttributeValues, setSavingAttributeValues] = useState(false)
  const [selectedResourceTypeId, setSelectedResourceTypeId] = useState<string | null>(null)
  const [selectedResourceId, setSelectedResourceId] = useState<string | null>(null)
  const [resourceListResourceTypeId, setResourceListResourceTypeId] = useState<string | null>(null)
  const [photoPreviewResourceId, setPhotoPreviewResourceId] = useState<string | null>(null)
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
  const [pendingResourcePhoto, setPendingResourcePhoto] = useState<PendingResourcePhoto | null>(null)
  const [photoCropSource, setPhotoCropSource] = useState<PhotoCropSource | null>(null)
  const [photoPreviewFullSrc, setPhotoPreviewFullSrc] = useState<string | null>(null)
  const [photoPreviewStatus, setPhotoPreviewStatus] = useState<'loading' | 'full' | 'thumbnail'>(
    'loading'
  )
  const selectedResourceTypeIdRef = useRef<string | null>(null)
  const selectedResourceIdRef = useRef<string | null>(null)
  const photoPreviewRequestIdRef = useRef(0)
  const colorPickerRef = useRef<HTMLDivElement | null>(null)
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const resourceListDialogRef = useRef<HTMLDivElement | null>(null)
  const resourcePhotoInputRef = useRef<HTMLInputElement | null>(null)
  const resourcePhotoPreviewDialogRef = useRef<HTMLDivElement | null>(null)
  const attributesDialogRef = useRef<HTMLDivElement | null>(null)
  const attributeDeleteDialogRef = useRef<HTMLDivElement | null>(null)
  const [colorPickerOpen, setColorPickerOpen] = useState(false)
  useFocusTrap(dialogRef, activeDialog !== null)
  useFocusTrap(resourceListDialogRef, resourceListResourceTypeId !== null)
  useFocusTrap(resourcePhotoPreviewDialogRef, photoPreviewResourceId !== null)
  useFocusTrap(attributesDialogRef, attributeDefinitionDialog !== null)
  useFocusTrap(attributeDeleteDialogRef, pendingAttributeDelete !== null)

  const loadCatalog = useCallback(async (preferred?: {
    resourceTypeId?: string | null
    resourceId?: string | null
  }) => {
    setLoadStatus('loading')
    setError('')

    try {
      const [resourceTypeResult, resourceResult, resourcePhotosById, definitionResult, valueResult] = await Promise.all([
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
        loadResourcePhotoMap(),
        Sfsures_attributedefinitionsService.getAll({
          select: ['sfsures_attributedefinitionid', '_sfsures_resourcetype_value', '_sfsures_resource_value', 'sfsures_name', 'sfsures_datatype', 'sfsures_appliesto', 'sfsures_required', 'sfsures_choiceoptions', 'sfsures_displayorder'],
          filter: 'statecode eq 0',
          orderBy: ['sfsures_displayorder asc', 'sfsures_name asc'],
          top: 1000,
        }),
        Sfsures_resourceattributevaluesService.getAll({
          select: ['sfsures_resourceattributevalueid', '_sfsures_resource_value', '_sfsures_attributedefinition_value', 'sfsures_valuetext', 'sfsures_valuechoice', 'sfsures_valuenumber', 'sfsures_valuedatetime', 'sfsures_valueboolean'],
          filter: 'statecode eq 0',
          top: 5000,
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

      const loadedResources = ((resourceResult.data ?? []) as Array<Sfsures_resources & Record<string, unknown>>)
        .map((resource) => {
          const resourceTypeId = resource._sfsures_resourcetype_value ?? ''
          const resourceType = resourceTypesById.get(resourceTypeId)
          const resourcePhoto = resourcePhotosById.get(resource.sfsures_resourceid)

          return {
            resourceId: resource.sfsures_resourceid,
            name: resource.sfsures_name,
            resourceTypeId,
            resourceTypeName: resourceType?.name ?? 'Unassigned',
            resourceTypeStatus: resourceType?.status ?? null,
            location: resource.sfsures_location ?? '',
            description: resource.sfsures_description ?? '',
            calendarColor:
              resource.sfsures_calendarcolor ?? DEFAULT_RESOURCE_COLOR,
            recordStatus: resource.sfsures_recordstatus ?? RESOURCE_STATUS_ACTIVE,
            photoThumbnailUrl: resourcePhoto?.photoThumbnailUrl ?? null,
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
      setAttributeDefinitions(((definitionResult.data ?? []) as Sfsures_attributedefinitions[]).map((definition) => ({
        id: definition.sfsures_attributedefinitionid,
        resourceTypeId: definition._sfsures_resourcetype_value ?? '',
        resourceId: definition._sfsures_resource_value ?? '',
        name: definition.sfsures_name,
        dataType: definition.sfsures_datatype,
        appliesTo: definition.sfsures_appliesto ?? ATTRIBUTE_APPLIES_TO_RESOURCE,
        required:
          definition.sfsures_appliesto === ATTRIBUTE_APPLIES_TO_RESERVATION &&
          definition.sfsures_required === true,
        choiceOptions: (definition.sfsures_choiceoptions ?? '').split(/\r?\n/).map((option) => option.trim()).filter(Boolean),
        displayOrder: definition.sfsures_displayorder ?? 0,
      })))
      setAttributeValues(((valueResult.data ?? []) as Sfsures_resourceattributevalues[]).map((value) => ({
        id: value.sfsures_resourceattributevalueid,
        resourceId: value._sfsures_resource_value ?? '',
        definitionId: value._sfsures_attributedefinition_value ?? '',
        value: attributeValueText(value),
      })))
      setSelectedResourceTypeId(nextResourceTypeId)
      setSelectedResourceId(nextResourceId)
      setResourceTypeForm(resourceTypeFormFrom(nextResourceType))
      setResourceForm(resourceFormFrom(nextResource, nextResourceTypeId ?? ''))
      setLoadStatus('ready')
    } catch (err) {
      console.error('Resource catalog admin load failed:', err)
      setError(err instanceof Error ? err.message : 'Resource catalog could not be loaded.')
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

  const photoPreviewResource = useMemo(
    () => resources.find((resource) => resource.resourceId === photoPreviewResourceId) ?? null,
    [photoPreviewResourceId, resources]
  )

  const photoPreviewSrc =
    photoPreviewFullSrc ?? photoPreviewResource?.photoThumbnailUrl ?? null

  const resourceListResourceType = useMemo(
    () =>
      resourceTypes.find(
        (resourceType) => resourceType.resourceTypeId === resourceListResourceTypeId
      ) ?? null,
    [resourceListResourceTypeId, resourceTypes]
  )

  const resourceListResources = useMemo(
    () =>
      resourceListResourceTypeId
        ? resources.filter((resource) => resource.resourceTypeId === resourceListResourceTypeId)
        : [],
    [resourceListResourceTypeId, resources]
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
  const reservableResourceCount = resources.filter(isResourceReservable).length
  const totalResourceCount = resources.length
  const selectedResourceStatusPill = selectedResource
    ? resourceStatusPill(selectedResource)
    : null
  const selectedResourceColor =
    resourceColorByValue(resourceForm.calendarColor) ?? RESOURCE_COLOR_OPTIONS[0]
  const resourceTypeNameForForm =
    resourceTypes.find((resourceType) => resourceType.resourceTypeId === resourceForm.resourceTypeId)
      ?.name ?? ''
  const resourceFormPhotoPreviewUrl =
    pendingResourcePhoto?.previewUrl ??
    (activeDialog?.kind === 'resource' && activeDialog.mode === 'edit'
      ? selectedResource?.photoThumbnailUrl ?? null
      : null)
  const attributeDialogResourceType = useMemo(
    () =>
      attributeDefinitionDialog
        ? resourceTypes.find(
            (resourceType) =>
              resourceType.resourceTypeId === attributeDefinitionDialog.resourceTypeId
          ) ?? null
        : null,
    [attributeDefinitionDialog, resourceTypes]
  )
  const attributeDialogResource = useMemo(
    () =>
      attributeDefinitionDialog?.scope === 'resource' && attributeDefinitionDialog.resourceId
        ? resources.find(
            (resource) => resource.resourceId === attributeDefinitionDialog.resourceId
          ) ?? null
        : null,
    [attributeDefinitionDialog, resources]
  )
  const attributeDialogAppliesTo =
    attributeDefinitionDialog?.kind === 'customField'
      ? ATTRIBUTE_APPLIES_TO_RESERVATION
      : ATTRIBUTE_APPLIES_TO_RESOURCE
  const resourceIdsForAttributeDialogType = attributeDefinitionDialog
    ? new Set(
        resources
          .filter((resource) => resource.resourceTypeId === attributeDefinitionDialog.resourceTypeId)
          .map((resource) => resource.resourceId)
      )
    : new Set<string>()
  const attributeDialogDefinitions = attributeDefinitionDialog
    ? attributeDefinitions
        .filter(
          (definition) => {
            if (definition.appliesTo !== attributeDialogAppliesTo) return false
            if (attributeDefinitionDialog.scope === 'resource') {
              return (
                definition.resourceId === attributeDefinitionDialog.resourceId ||
                (definition.resourceTypeId === attributeDefinitionDialog.resourceTypeId &&
                  !definition.resourceId)
              )
            }

            return (
              definition.resourceTypeId === attributeDefinitionDialog.resourceTypeId &&
              !definition.resourceId
            )
          }
        )
        .sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name))
    : []
  const attributeDialogLabels =
    attributeDefinitionDialog?.kind === 'customField'
      ? {
          title: 'Custom Fields',
          empty: 'No custom fields defined.',
          name: 'Field name',
          save: 'Save Field',
          add: 'Add Field',
        }
      : {
          title: 'Resource Attributes',
          empty: 'No resource attributes defined.',
          name: 'Attribute name',
          save: 'Save Attribute',
          add: 'Add Attribute',
        }
  const attributeDialogValueDefinitions =
    attributeDefinitionDialog?.scope === 'resource' &&
    attributeDefinitionDialog.kind === 'resourceAttribute'
      ? attributeDefinitions
          .filter(
            (definition) =>
              definition.appliesTo === ATTRIBUTE_APPLIES_TO_RESOURCE &&
              (definition.resourceId === attributeDefinitionDialog.resourceId ||
                (definition.resourceTypeId === attributeDefinitionDialog.resourceTypeId &&
                  !definition.resourceId)) &&
              (definition.dataType === ATTRIBUTE_TYPE_TEXT ||
                definition.dataType === ATTRIBUTE_TYPE_CHOICE)
          )
          .sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name))
      : []
  const selectedResourceAttributes = selectedResource
    ? attributeDefinitions
        .filter(
          (definition) =>
            (definition.resourceTypeId === selectedResource.resourceTypeId ||
              definition.resourceId === selectedResource.resourceId) &&
            definition.appliesTo === ATTRIBUTE_APPLIES_TO_RESOURCE
        )
        .map((definition) => ({
          definition,
          value: attributeValues.find(
            (value) => value.resourceId === selectedResource.resourceId && value.definitionId === definition.id
          )?.value ?? '',
        }))
        .filter((item) => item.value)
    : []

  function attributeDraftFor(resource: AdminResource | null): Record<string, string> {
    if (!resource) return {}
    return Object.fromEntries(
      attributeValues
        .filter((value) => value.resourceId === resource.resourceId)
        .map((value) => [value.definitionId, value.value])
    )
  }

  function openAttributeDefinitionsDialog(
    kind: AttributeDefinitionKind,
    scope: AttributeDefinitionDialog['scope'],
    resourceTypeId: string,
    resourceId?: string
  ) {
    setAttributeForm(EMPTY_ATTRIBUTE_FORM)
    setModalError('')
    setStatus('')
    if (resourceId) {
      setResourceAttributeDraft(
        attributeDraftFor(resources.find((resource) => resource.resourceId === resourceId) ?? null)
      )
    }
    setAttributeDefinitionDialog({ kind, scope, resourceTypeId, resourceId })
  }

  async function handleSaveAttributeDefinition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!attributeDefinitionDialog || !attributeDialogResourceType) return
    if (attributeDefinitionDialog.scope === 'resource' && !attributeDialogResource) {
      setModalError('Select a Resource before saving Resource-specific fields.')
      return
    }
    const name = attributeForm.name.trim()
    const options = attributeForm.choiceOptions.split(/\r?\n/).map((option) => option.trim()).filter(Boolean)
    const displayOrder = Number(attributeForm.displayOrder)
    const itemLabel =
      attributeDefinitionDialog.kind === 'customField' ? 'custom field' : 'resource attribute'
    if (!name) return setModalError(`Enter a ${itemLabel} name.`)
    if (!Number.isInteger(displayOrder)) return setModalError('Display order must be a whole number.')
    if (attributeDialogDefinitions.some((definition) => definition.id !== attributeForm.id && definition.name.toLowerCase() === name.toLowerCase())) {
      return setModalError(
        `A ${itemLabel} with this name already exists for this ${
          attributeDefinitionDialog.scope === 'resource' ? 'Resource' : 'Resource Type'
        }.`
      )
    }
    if (
      attributeDefinitionDialog.scope === 'resource' &&
      attributeDefinitions.some(
        (definition) =>
          definition.id !== attributeForm.id &&
          definition.appliesTo === attributeDialogAppliesTo &&
          definition.resourceTypeId === attributeDefinitionDialog.resourceTypeId &&
          !definition.resourceId &&
          definition.name.toLowerCase() === name.toLowerCase()
      )
    ) {
      return setModalError(
        `This Resource already inherits a ${itemLabel} with that name from its Resource Type.`
      )
    }
    if (
      attributeDefinitionDialog.scope === 'resourceType' &&
      attributeDefinitions.some(
        (definition) =>
          definition.id !== attributeForm.id &&
          definition.appliesTo === attributeDialogAppliesTo &&
          definition.resourceId &&
          resourceIdsForAttributeDialogType.has(definition.resourceId) &&
          definition.name.toLowerCase() === name.toLowerCase()
      )
    ) {
      return setModalError(
        `A Resource in this type already has a ${itemLabel} with that name. Rename that Resource-specific field first.`
      )
    }
    if (attributeForm.dataType === ATTRIBUTE_TYPE_CHOICE && options.length < 2) {
      return setModalError('Enter at least two Choice options, one per line.')
    }
    if (
      attributeDefinitionDialog.kind === 'resourceAttribute' &&
      attributeForm.id &&
      attributeForm.dataType === ATTRIBUTE_TYPE_CHOICE
    ) {
      const invalidExistingValue = attributeValues.find(
        (value) => value.definitionId === attributeForm.id && value.value && !options.includes(value.value)
      )
      if (invalidExistingValue) {
        return setModalError('An existing Resource uses a Choice option that would be removed.')
      }
    }
    setSavingAttribute(true)
    setModalError('')
    try {
      const fields = {
        sfsures_name: name,
        sfsures_datatype: attributeForm.dataType,
        sfsures_appliesto: attributeDialogAppliesTo,
        sfsures_required:
          attributeDefinitionDialog.kind === 'customField' ? attributeForm.required : false,
        sfsures_choiceoptions: attributeForm.dataType === ATTRIBUTE_TYPE_CHOICE ? options.join('\n') : null,
        sfsures_displayorder: displayOrder,
        ...(attributeDefinitionDialog.scope === 'resource'
          ? { 'sfsures_Resource@odata.bind': `/sfsures_resources(${attributeDialogResource!.resourceId})` }
          : {
              'sfsures_ResourceType@odata.bind': `/sfsures_resourcetypes(${attributeDefinitionDialog.resourceTypeId})`,
            }),
      }
      if (attributeForm.id) {
        await Sfsures_attributedefinitionsService.update(attributeForm.id, fields as unknown as Parameters<typeof Sfsures_attributedefinitionsService.update>[1])
      } else {
        await Sfsures_attributedefinitionsService.create({ ...fields, statecode: 0, statuscode: 1 } as unknown as Parameters<typeof Sfsures_attributedefinitionsService.create>[0])
      }
      await loadCatalog({
        resourceTypeId: attributeDefinitionDialog.resourceTypeId,
        resourceId: attributeDefinitionDialog.resourceId,
      })
      setAttributeForm(EMPTY_ATTRIBUTE_FORM)
      setStatus(attributeDefinitionDialog.kind === 'customField' ? 'Custom field saved.' : 'Resource attribute saved.')
    } catch (err) {
      setModalError(
        err instanceof Error
          ? err.message
          : attributeDefinitionDialog.kind === 'customField'
            ? 'Custom field could not be saved.'
            : 'Resource attribute could not be saved.'
      )
    } finally {
      setSavingAttribute(false)
    }
  }

  async function handleDeleteAttributeDefinition(definition: AttributeDefinition) {
    if (!attributeDefinitionDialog) return

    setPendingAttributeDelete({ definition, dialog: attributeDefinitionDialog })
  }

  async function confirmDeleteAttributeDefinition() {
    if (!pendingAttributeDelete) return

    const { definition, dialog } = pendingAttributeDelete
    const itemLabel =
      dialog.kind === 'customField' ? 'custom field' : 'resource attribute'

    setSavingAttribute(true)
    setModalError('')
    setStatus('')
    try {
      if (dialog.kind === 'resourceAttribute') {
        const valuesToDelete = attributeValues.filter(
          (value) => value.definitionId === definition.id
        )
        await Promise.all(
          valuesToDelete.map((value) =>
            Sfsures_resourceattributevaluesService.delete(value.id)
          )
        )
      } else {
        const answerResult = await Sfsures_reservationattributevaluesService.getAll({
          select: [
            'sfsures_reservationattributevalueid',
            '_sfsures_attributedefinition_value',
          ],
          filter: `statecode eq 0 and _sfsures_attributedefinition_value eq ${definition.id}`,
          top: 5000,
        })
        const answersToDelete = (
          (answerResult.data ?? []) as Sfsures_reservationattributevalues[]
        ).filter((answer) => answer._sfsures_attributedefinition_value === definition.id)
        await Promise.all(
          answersToDelete.map((answer) =>
            Sfsures_reservationattributevaluesService.delete(
              answer.sfsures_reservationattributevalueid
            )
          )
        )
      }

      await Sfsures_attributedefinitionsService.delete(definition.id)
      if (attributeForm.id === definition.id) {
        setAttributeForm(EMPTY_ATTRIBUTE_FORM)
      }
      await loadCatalog({
        resourceTypeId: dialog.resourceTypeId,
        resourceId: dialog.resourceId,
      })
      setPendingAttributeDelete(null)
      setStatus(
        dialog.kind === 'customField'
          ? 'Custom field deleted.'
          : 'Resource attribute deleted.'
      )
    } catch (err) {
      setModalError(
        err instanceof Error ? err.message : `${itemLabel} could not be deleted.`
      )
    } finally {
      setSavingAttribute(false)
    }
  }

  async function saveResourceAttributeValues(
    resourceId: string,
    definitions: AttributeDefinition[]
  ) {
    for (const definition of definitions) {
      const desired = (resourceAttributeDraft[definition.id] ?? '').trim()
      const existing = attributeValues.find(
        (value) => value.resourceId === resourceId && value.definitionId === definition.id
      )
      if (!desired && existing) {
        await Sfsures_resourceattributevaluesService.delete(existing.id)
      } else if (desired && existing) {
        await Sfsures_resourceattributevaluesService.update(existing.id, {
          sfsures_valuetext: definition.dataType === ATTRIBUTE_TYPE_TEXT ? desired : null,
          sfsures_valuechoice: definition.dataType === ATTRIBUTE_TYPE_CHOICE ? desired : null,
        } as unknown as Parameters<typeof Sfsures_resourceattributevaluesService.update>[1])
      } else if (desired) {
        await Sfsures_resourceattributevaluesService.create({
          sfsures_name: `${resourceId} - ${definition.name}`,
          'sfsures_Resource@odata.bind': `/sfsures_resources(${resourceId})`,
          'sfsures_AttributeDefinition@odata.bind': `/sfsures_attributedefinitions(${definition.id})`,
          sfsures_valuetext: definition.dataType === ATTRIBUTE_TYPE_TEXT ? desired : undefined,
          sfsures_valuechoice: definition.dataType === ATTRIBUTE_TYPE_CHOICE ? desired : undefined,
          statecode: 0,
          statuscode: 1,
        } as unknown as Parameters<typeof Sfsures_resourceattributevaluesService.create>[0])
      }
    }
  }

  async function handleSaveDialogResourceAttributeValues() {
    if (!attributeDialogResource) return

    const invalidChoice = attributeDialogValueDefinitions.find(
      (definition) =>
        definition.dataType === ATTRIBUTE_TYPE_CHOICE &&
        (resourceAttributeDraft[definition.id] ?? '').trim() &&
        !definition.choiceOptions.includes((resourceAttributeDraft[definition.id] ?? '').trim())
    )
    if (invalidChoice) {
      setModalError(`Choose a valid option for ${invalidChoice.name}.`)
      return
    }

    setSavingAttributeValues(true)
    setModalError('')
    setStatus('')
    try {
      await saveResourceAttributeValues(
        attributeDialogResource.resourceId,
        attributeDialogValueDefinitions
      )
      await loadCatalog({
        resourceTypeId: attributeDialogResource.resourceTypeId,
        resourceId: attributeDialogResource.resourceId,
      })
      setStatus('Resource attribute values saved.')
    } catch (err) {
      setModalError(
        err instanceof Error ? err.message : 'Resource attribute values could not be saved.'
      )
    } finally {
      setSavingAttributeValues(false)
    }
  }

  function clearResourcePhotoDraft() {
    setPhotoCropSource(null)
    setPendingResourcePhoto(null)
    if (resourcePhotoInputRef.current) {
      resourcePhotoInputRef.current.value = ''
    }
  }

  async function openResourcePhotoPreview(resource: AdminResource) {
    if (!resource.photoThumbnailUrl) return

    const requestId = photoPreviewRequestIdRef.current + 1
    photoPreviewRequestIdRef.current = requestId
    setPhotoPreviewResourceId(resource.resourceId)
    setPhotoPreviewFullSrc(null)
    setPhotoPreviewStatus('loading')

    try {
      const result = await Sfsures_resourcesService.downloadImage(
        resource.resourceId,
        RESOURCE_PHOTO_COLUMN,
        true
      )
      const bytes = result.data

      if (!bytes || bytes.byteLength === 0) {
        throw new Error('Dataverse returned an empty full-size image.')
      }

      const fullSizeSrc = await resourcePhotoBytesAsDataUrl(bytes)
      if (photoPreviewRequestIdRef.current !== requestId) return

      setPhotoPreviewFullSrc(fullSizeSrc)
      setPhotoPreviewStatus('full')
    } catch (err) {
      if (photoPreviewRequestIdRef.current !== requestId) return

      console.warn('The full-size Resource photo could not be loaded:', err)
      setPhotoPreviewStatus('thumbnail')
    }
  }

  function closeResourcePhotoPreview() {
    photoPreviewRequestIdRef.current += 1
    setPhotoPreviewResourceId(null)
    setPhotoPreviewFullSrc(null)
    setPhotoPreviewStatus('loading')
  }

  function handleResourcePhotoPreviewKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Escape') return

    event.preventDefault()
    closeResourcePhotoPreview()
  }

  function handleResourcePhotoButtonClick() {
    resourcePhotoInputRef.current?.click()
  }

  async function handleResourcePhotoFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file) return

    if (!isSupportedResourcePhoto(file)) {
      setModalError('Upload a JPG, PNG, GIF, or BMP image.')
      return
    }

    if (file.size > RESOURCE_PHOTO_MAX_BYTES) {
      setModalError(
        `Photo is too large. The maximum size for resource photos is ${formatBytes(RESOURCE_PHOTO_MAX_BYTES)}.`
      )
      return
    }

    setModalError('')

    try {
      setPhotoCropSource({ dataUrl: await readImageAsDataUrl(file) })
    } catch (err) {
      setPhotoCropSource(null)
      setModalError(err instanceof Error ? err.message : 'The selected image could not be read.')
    }
  }

  function handleCroppedResourcePhoto(photo: PendingResourcePhoto) {
    setPendingResourcePhoto(photo)
    setPhotoCropSource(null)
    setModalError('')
  }

  async function uploadResourcePhoto(resourceId: string, file: File) {
    await Sfsures_resourcesService.upload(resourceId, RESOURCE_PHOTO_COLUMN, file, file.name)
  }

  function closeDialog() {
    setActiveDialog(null)
    setModalError('')
    setColorPickerOpen(false)
    clearResourcePhotoDraft()
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

  function openResourceTypeResourcesDialog() {
    if (!selectedResourceType) return
    setResourceListResourceTypeId(selectedResourceType.resourceTypeId)
  }

  function closeResourceTypeResourcesDialog() {
    setResourceListResourceTypeId(null)
  }

  function openCreateResourceDialog() {
    setResourceForm(emptyResourceForm(fallbackResourceTypeId))
    setResourceAttributeDraft({})
    setActiveDialog({ kind: 'resource', mode: 'create' })
    setModalError('')
    clearResourcePhotoDraft()
    setStatus('')
  }

  function openEditResourceDialog() {
    if (!selectedResource) return
    setResourceForm(resourceFormFrom(selectedResource, fallbackResourceTypeId))
    setResourceAttributeDraft(attributeDraftFor(selectedResource))
    setActiveDialog({ kind: 'resource', mode: 'edit' })
    setModalError('')
    setColorPickerOpen(false)
    clearResourcePhotoDraft()
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

  function handleResourceListDialogKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Escape') return

    event.preventDefault()
    closeResourceTypeResourcesDialog()
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
        const changedFields: Record<string, unknown> = {
          sfsures_name: name,
          'sfsures_ResourceType@odata.bind': `/sfsures_resourcetypes(${resourceTypeId})`,
          sfsures_location: location || null,
          sfsures_description: description || null,
          sfsures_calendarcolor: resourceForm.calendarColor,
        }
        let photoUploaded = true

        await Sfsures_resourcesService.update(
          resourceForm.id,
          changedFields as unknown as Parameters<typeof Sfsures_resourcesService.update>[1]
        )

        if (pendingResourcePhoto) {
          try {
            await uploadResourcePhoto(resourceForm.id, pendingResourcePhoto.file)
          } catch (photoErr) {
            photoUploaded = false
            console.error('Upload resource photo failed:', photoErr)
          }
        }

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
            photoUpdated: Boolean(pendingResourcePhoto) && photoUploaded,
          },
        })
        setStatus(
          photoUploaded
            ? auditWritten
              ? 'Resource saved.'
              : 'Resource saved. Audit log could not be written.'
            : 'Resource saved, but the photo could not be uploaded. Try adding the photo again from Edit Resource.'
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
        let photoUploaded = true

        if (pendingResourcePhoto) {
          if (createdId) {
            try {
              await uploadResourcePhoto(createdId, pendingResourcePhoto.file)
            } catch (photoErr) {
              photoUploaded = false
              console.error('Upload resource photo failed:', photoErr)
            }
          } else {
            photoUploaded = false
          }
        }

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
            photoUpdated: Boolean(pendingResourcePhoto) && photoUploaded,
          },
          details: {
            source: 'Admin Resources screen',
            catalogEntity: 'Resource',
            operation: 'create',
            photoUpdated: Boolean(pendingResourcePhoto) && photoUploaded,
          },
        })
        setStatus(
          photoUploaded
            ? auditWritten
              ? 'Resource created.'
              : 'Resource created. Audit log could not be written.'
            : 'Resource created, but the photo could not be uploaded. Try adding the photo from Edit Resource.'
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
    const loadingTitle = mode === 'resourceTypes' ? 'Resource Types' : 'Resources'

    return (
      <section className={styles.settingsPanel} aria-busy="true">
        <div className={styles.panelToolbar}>
          <h2>{loadingTitle}</h2>
        </div>
        <div className={styles.inlineLoading} role="status">
          Loading {loadingTitle.toLowerCase()}...
        </div>
      </section>
    )
  }

  return (
    <section className={styles.settingsPanel}>
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
          {mode === 'resourceTypes' && (
          <section className={styles.formSection} aria-labelledby="resource-types-heading">
            <div className={styles.sectionHeader}>
              <div>
                <h3 id="resource-types-heading">Resource Types</h3>
                <p className={styles.sectionMeta}>
                  {activeResourceTypeCount} active / {resourceTypes.length} total
                </p>
              </div>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={openCreateResourceTypeDialog}
              >
                New Resource Type
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
                        className={styles.secondaryButton}
                        onClick={() =>
                          openAttributeDefinitionsDialog(
                            'resourceAttribute',
                            'resourceType',
                            selectedResourceType.resourceTypeId
                          )
                        }
                      >
                        Resource Attributes
                      </button>
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        onClick={() =>
                          openAttributeDefinitionsDialog(
                            'customField',
                            'resourceType',
                            selectedResourceType.resourceTypeId
                          )
                        }
                      >
                        Custom Fields
                      </button>
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        onClick={openResourceTypeResourcesDialog}
                      >
                        Show Resources
                      </button>
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
          )}

          {mode === 'resources' && (
          <section
            className={styles.formSection}
            aria-labelledby="resources-heading"
          >
            <div className={styles.sectionHeader}>
              <div>
                <h3 id="resources-heading">Resources</h3>
                <p className={styles.sectionMeta}>
                  {reservableResourceCount} reservable / {totalResourceCount} total
                </p>
              </div>
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
                      const statusPill = resourceStatusPill(resource)

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
                          <span className={statusPill.className}>{statusPill.label}</span>
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
                      {selectedResourceStatusPill && (
                        <span className={selectedResourceStatusPill.className}>
                          {selectedResourceStatusPill.label}
                        </span>
                      )}
                    </div>

                    <div className={styles.resourcePhotoDetail}>
                      {selectedResource.photoThumbnailUrl ? (
                        <button
                          type="button"
                          className={styles.resourcePhotoThumbButton}
                          onClick={() => void openResourcePhotoPreview(selectedResource)}
                        >
                          <img
                            src={selectedResource.photoThumbnailUrl}
                            alt={`${selectedResource.name} resource photo`}
                          />
                        </button>
                      ) : (
                        <div className={styles.resourcePhotoPlaceholder}>No photo uploaded</div>
                      )}
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
                        <dt>Reservable</dt>
                        <dd>{resourceReservableLabel(selectedResource)}</dd>
                      </div>
                      <div>
                        <dt>Color</dt>
                        <dd>{resourceColorByValue(selectedResource.calendarColor)?.label ?? 'Default'}</dd>
                      </div>
                    </dl>

                    {selectedResource.description && (
                      <p className={styles.groupDescription}>{selectedResource.description}</p>
                    )}

                    {selectedResourceAttributes.length > 0 && (
                      <section className={styles.customAttributeSection} aria-labelledby="resource-attributes-heading">
                        <h4 id="resource-attributes-heading">Resource Attributes</h4>
                        <dl className={styles.customAttributeList}>
                          {selectedResourceAttributes.map(({ definition, value }) => (
                            <div key={definition.id}>
                              <dt>{definition.name}</dt>
                              <dd>{value}</dd>
                            </div>
                          ))}
                        </dl>
                      </section>
                    )}

                    <div className={styles.detailActions}>
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        onClick={() =>
                          openAttributeDefinitionsDialog(
                            'resourceAttribute',
                            'resource',
                            selectedResource.resourceTypeId,
                            selectedResource.resourceId
                          )
                        }
                      >
                        Resource Attributes
                      </button>
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        onClick={() =>
                          openAttributeDefinitionsDialog(
                            'customField',
                            'resource',
                            selectedResource.resourceTypeId,
                            selectedResource.resourceId
                          )
                        }
                      >
                        Custom Fields
                      </button>
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
          )}
        </div>
      )}

      {resourceListResourceType && (
        <div className={styles.modalBackdrop}>
          <div
            ref={resourceListDialogRef}
            className={`${styles.adminModal} ${styles.resourceListModal}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby={resourceListDialogTitleId}
            tabIndex={-1}
            onKeyDown={handleResourceListDialogKeyDown}
          >
            <header className={styles.modalHeader}>
              <div>
                <p className={styles.detailLabel}>Resource Type Resources</p>
                <h2 id={resourceListDialogTitleId}>{resourceListResourceType.name}</h2>
              </div>
            </header>

            <div className={styles.modalBody}>
              {resourceListResources.length === 0 ? (
                <p className={styles.emptyState}>No resources have this Resource Type.</p>
              ) : (
                <div className={styles.resourceTypeResourceTableWrap}>
                  <table className={styles.resourceTypeResourceTable}>
                    <thead>
                      <tr>
                        <th scope="col">Resource Name</th>
                        <th scope="col">Location</th>
                        <th scope="col">Reservable Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resourceListResources.map((resource) => (
                        <tr key={resource.resourceId}>
                          <td>
                            <span className={styles.resourceTypeResourceName}>
                              {resource.name}
                            </span>
                          </td>
                          <td>{resource.location || 'Unavailable'}</td>
                          <td>{resourceReservableLabel(resource)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <footer className={styles.modalFooter}>
              <div className={styles.modalFooterStatus}>
                <span>
                  {resourceListResources.length}{' '}
                  {resourceListResources.length === 1 ? 'resource' : 'resources'}
                </span>
              </div>
              <div className={styles.modalFooterActions}>
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={closeResourceTypeResourcesDialog}
                >
                  Done
                </button>
              </div>
            </footer>
          </div>
        </div>
      )}

      {photoPreviewResource && photoPreviewSrc && (
        <div className={styles.modalBackdrop}>
          <div
            ref={resourcePhotoPreviewDialogRef}
            className={`${styles.adminModal} ${styles.resourcePhotoPreviewModal}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby={resourcePhotoPreviewTitleId}
            tabIndex={-1}
            onKeyDown={handleResourcePhotoPreviewKeyDown}
          >
            <header className={styles.modalHeader}>
              <div>
                <p className={styles.detailLabel}>Resource Photo</p>
                <h2 id={resourcePhotoPreviewTitleId}>{photoPreviewResource.name}</h2>
              </div>
            </header>

            <div className={styles.resourcePhotoPreviewBody}>
              <img
                src={photoPreviewSrc}
                alt={`${photoPreviewResource.name} resource photo`}
                onError={() => {
                  if (photoPreviewStatus === 'full') {
                    setPhotoPreviewFullSrc(null)
                    setPhotoPreviewStatus('thumbnail')
                  }
                }}
              />
            </div>

            <footer className={styles.modalFooter}>
              <div className={styles.modalFooterStatus}>
                <span role="status">
                  {photoPreviewStatus === 'loading'
                    ? 'Loading full-size photo...'
                    : photoPreviewStatus === 'full'
                      ? 'Showing full-size photo'
                      : 'Full-size photo unavailable; showing thumbnail'}
                </span>
              </div>
              <div className={styles.modalFooterActions}>
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={closeResourcePhotoPreview}
                >
                  Done
                </button>
              </div>
            </footer>
          </div>
        </div>
      )}

      {attributeDefinitionDialog && attributeDialogResourceType && (
        <div className={styles.modalBackdrop}>
          <div ref={attributesDialogRef} className={`${styles.adminModal} ${styles.resourceListModal}`} role="dialog" aria-modal="true" aria-labelledby="custom-fields-title" tabIndex={-1}>
            <header className={styles.modalHeader}>
              <div>
                <p className={styles.detailLabel}>
                  {attributeDefinitionDialog.scope === 'resource' ? 'Resource' : 'Resource Type'}
                </p>
                <h2 id="custom-fields-title">
                  {(attributeDefinitionDialog.scope === 'resource'
                    ? attributeDialogResource?.name
                    : attributeDialogResourceType.name) ?? attributeDialogResourceType.name}{' '}
                  {attributeDialogLabels.title}
                </h2>
              </div>
              <button type="button" className={styles.secondaryButton} onClick={() => setAttributeDefinitionDialog(null)}>Close</button>
            </header>
            {modalError && <p className={styles.errorBanner} role="alert">{modalError}</p>}
            <div className={styles.modalBody}>
              <form className={styles.attributeDefinitionForm} onSubmit={handleSaveAttributeDefinition}>
                <label className={styles.field}><span>{attributeDialogLabels.name}</span><input className={styles.input} value={attributeForm.name} onChange={(event) => setAttributeForm((current) => ({ ...current, name: event.target.value }))} /></label>
                <label className={styles.field}><span>Type</span><select className={styles.input} value={attributeForm.dataType} disabled={attributeForm.id !== null} onChange={(event) => setAttributeForm((current) => ({ ...current, dataType: Number(event.target.value) }))}><option value={ATTRIBUTE_TYPE_TEXT}>Text</option><option value={ATTRIBUTE_TYPE_CHOICE}>Choice</option></select></label>
                <label className={styles.field}><span>Display order</span><input className={styles.input} type="number" step="1" value={attributeForm.displayOrder} onChange={(event) => setAttributeForm((current) => ({ ...current, displayOrder: event.target.value }))} /></label>
                {attributeDefinitionDialog.kind === 'customField' && <label className={styles.checkboxField}><input type="checkbox" checked={attributeForm.required} onChange={(event) => setAttributeForm((current) => ({ ...current, required: event.target.checked }))} /><span>Required</span></label>}
                {attributeForm.dataType === ATTRIBUTE_TYPE_CHOICE && <label className={`${styles.field} ${styles.attributeOptionsField}`}><span>Choice options (one per line)</span><textarea className={styles.textarea} rows={4} value={attributeForm.choiceOptions} onChange={(event) => setAttributeForm((current) => ({ ...current, choiceOptions: event.target.value }))} /></label>}
                <div className={styles.attributeFormActions}><button type="button" className={styles.secondaryButton} onClick={() => setAttributeForm(EMPTY_ATTRIBUTE_FORM)}>Clear</button><button type="submit" className={styles.primaryButton} disabled={savingAttribute}>{savingAttribute ? 'Saving...' : attributeForm.id ? attributeDialogLabels.save : attributeDialogLabels.add}</button></div>
              </form>
              <div className={styles.attributeDefinitionList}>
                {attributeDialogDefinitions.length === 0 ? <p className={styles.emptyState}>{attributeDialogLabels.empty}</p> : attributeDialogDefinitions.map((definition) => (
                  <div key={definition.id} className={styles.attributeDefinitionRow}>
                    <button type="button" className={styles.attributeDefinitionItem} disabled={(attributeDefinitionDialog.scope === 'resource' && !definition.resourceId) || (definition.dataType !== ATTRIBUTE_TYPE_TEXT && definition.dataType !== ATTRIBUTE_TYPE_CHOICE)} onClick={() => setAttributeForm({ id: definition.id, name: definition.name, dataType: definition.dataType, required: definition.required, choiceOptions: definition.choiceOptions.join('\n'), displayOrder: String(definition.displayOrder) })}>
                      <strong>{definition.name}</strong><span>{definition.dataType === ATTRIBUTE_TYPE_CHOICE ? 'Choice' : definition.dataType === ATTRIBUTE_TYPE_TEXT ? 'Text' : 'Existing unsupported type'} · order {definition.displayOrder}{definition.required ? ' · required' : ''}{attributeDefinitionDialog.scope === 'resource' && !definition.resourceId ? ' · Inherited from Resource Type' : ''}</span>
                    </button>
                    {(attributeDefinitionDialog.scope === 'resourceType' || definition.resourceId) && (
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        disabled={savingAttribute}
                        onClick={() => void handleDeleteAttributeDefinition(definition)}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {attributeDefinitionDialog.scope === 'resource' &&
                attributeDefinitionDialog.kind === 'resourceAttribute' && (
                  <section
                    className={styles.attributeValueEditor}
                    aria-labelledby="resource-attribute-values-heading"
                  >
                    <div>
                      <h3 id="resource-attribute-values-heading">Attribute Values</h3>
                      <p className={styles.fieldHint}>
                        Values saved here are shown to users as read-only Resource details.
                      </p>
                    </div>
                    {attributeDialogValueDefinitions.length === 0 ? (
                      <p className={styles.emptyState}>
                        Add a Resource Attribute before entering values.
                      </p>
                    ) : (
                      <div className={styles.attributeValueGrid}>
                        {attributeDialogValueDefinitions.map((definition) => (
                          <label key={definition.id} className={styles.field}>
                            <span>
                              {definition.name}
                              {definition.resourceTypeId ? (
                                <span className={styles.attributeSourceNote}>
                                  Inherited from Resource Type
                                </span>
                              ) : null}
                            </span>
                            {definition.dataType === ATTRIBUTE_TYPE_CHOICE ? (
                              <select
                                className={styles.input}
                                value={resourceAttributeDraft[definition.id] ?? ''}
                                onChange={(event) =>
                                  setResourceAttributeDraft((current) => ({
                                    ...current,
                                    [definition.id]: event.target.value,
                                  }))
                                }
                              >
                                <option value="">Select an option</option>
                                {definition.choiceOptions.map((option) => (
                                  <option key={option} value={option}>
                                    {option}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <input
                                className={styles.input}
                                value={resourceAttributeDraft[definition.id] ?? ''}
                                onChange={(event) =>
                                  setResourceAttributeDraft((current) => ({
                                    ...current,
                                    [definition.id]: event.target.value,
                                  }))
                                }
                              />
                            )}
                          </label>
                        ))}
                      </div>
                    )}
                    <div className={styles.attributeFormActions}>
                      <button
                        type="button"
                        className={styles.primaryButton}
                        disabled={
                          savingAttributeValues || attributeDialogValueDefinitions.length === 0
                        }
                        onClick={() => void handleSaveDialogResourceAttributeValues()}
                      >
                        {savingAttributeValues ? 'Saving...' : 'Save Values'}
                      </button>
                    </div>
                  </section>
                )}
            </div>
            <footer className={styles.modalFooter}><span role="status">{status}</span><div className={styles.modalFooterActions}><button type="button" className={styles.primaryButton} onClick={() => setAttributeDefinitionDialog(null)}>Done</button></div></footer>
          </div>
        </div>
      )}

      {pendingAttributeDelete && (
        <div className={styles.modalBackdrop}>
          <div
            ref={attributeDeleteDialogRef}
            className={`${styles.adminModal} ${styles.confirmModal}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="attribute-delete-title"
            tabIndex={-1}
          >
            <header className={styles.modalHeader}>
              <div>
                <p className={styles.detailLabel}>Confirm Delete</p>
                <h2 id="attribute-delete-title">
                  Delete {pendingAttributeDelete.definition.name}?
                </h2>
              </div>
            </header>
            <div className={styles.modalBody}>
              <p className={styles.confirmText}>
                {pendingAttributeDelete.dialog.kind === 'customField'
                  ? 'This removes the Custom Field from the reservation form. Saved answers for this field will be removed too.'
                  : 'This removes the Resource Attribute from the admin setup. Any saved values for this attribute will be removed too.'}
              </p>
            </div>
            <footer className={styles.modalFooter}>
              <div className={styles.modalFooterStatus}>
                <span>{savingAttribute ? 'Deleting...' : ''}</span>
              </div>
              <div className={styles.modalFooterActions}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  disabled={savingAttribute}
                  onClick={() => setPendingAttributeDelete(null)}
                >
                  {pendingAttributeDelete.dialog.kind === 'customField'
                    ? 'Keep Field'
                    : 'Keep Attribute'}
                </button>
                <button
                  type="button"
                  className={styles.dangerButton}
                  disabled={savingAttribute}
                  onClick={() => void confirmDeleteAttributeDefinition()}
                >
                  {pendingAttributeDelete.dialog.kind === 'customField'
                    ? 'Delete Field'
                    : 'Delete Attribute'}
                </button>
              </div>
            </footer>
          </div>
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
                        {
                          setResourceForm((current) => ({ ...current, resourceTypeId: event.target.value }))
                          setResourceAttributeDraft({})
                        }
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

                  <div className={styles.field}>
                    <span>Resource photo</span>
                    <div className={styles.resourcePhotoEditor}>
                      {resourceFormPhotoPreviewUrl ? (
                        <img
                          className={styles.resourcePhotoFormPreview}
                          src={resourceFormPhotoPreviewUrl}
                          alt="Selected resource preview"
                        />
                      ) : (
                        <div className={styles.resourcePhotoFormPlaceholder}>
                          No photo selected
                        </div>
                      )}

                      <div className={styles.resourcePhotoEditorActions}>
                        <button
                          type="button"
                          className={styles.secondaryButton}
                          onClick={handleResourcePhotoButtonClick}
                        >
                          {resourceFormPhotoPreviewUrl ? 'Change Photo' : 'Upload Photo'}
                        </button>
                        <p className={styles.fieldHint}>
                          JPG, PNG, GIF, or BMP. Max {formatBytes(RESOURCE_PHOTO_MAX_BYTES)}.
                        </p>
                      </div>

                      <input
                        ref={resourcePhotoInputRef}
                        type="file"
                        accept={RESOURCE_PHOTO_ACCEPT}
                        className={styles.srOnly}
                        onChange={handleResourcePhotoFileChange}
                      />
                    </div>

                    {pendingResourcePhoto && (
                      <p className={styles.fieldHint}>
                        Cropped photo ready ({formatBytes(pendingResourcePhoto.byteSize)}). It
                        will upload when you save this resource.
                      </p>
                    )}

                    {photoCropSource && (
                      <Suspense
                        fallback={
                          <div className={styles.inlineLoading} role="status">
                            Loading cropper...
                          </div>
                        }
                      >
                        <ResourcePhotoCropper
                          imageUrl={photoCropSource.dataUrl}
                          onCancel={() => setPhotoCropSource(null)}
                          onUsePhoto={handleCroppedResourcePhoto}
                        />
                      </Suspense>
                    )}
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
