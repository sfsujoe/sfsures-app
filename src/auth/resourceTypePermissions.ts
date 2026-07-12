import { Sfsures_groupresourcetypeaccessesService } from '../generated/services/Sfsures_groupresourcetypeaccessesService'
import { APP_ADMIN_GROUP_KEY, REPORT_VIEWERS_GROUP_KEY, type CurrentUserGroup } from './UserContext'

const ACCESS_LEVEL_BOOK = 997330000

export type ResourceTypePermissionRequirement = 'view' | 'book'

/**
 * Resolves Resource Type access only. Individual Resource access rows are
 * intentionally ignored so every runtime permission flows through groups and
 * Resource Types.
 */
export async function loadPermittedResourceTypeIds(
  groups: CurrentUserGroup[],
  requirement: ResourceTypePermissionRequirement
): Promise<Set<string>> {
  const permissionGroupIds = groups
    .filter(
      (group) =>
        group.groupKey !== APP_ADMIN_GROUP_KEY && group.groupKey !== REPORT_VIEWERS_GROUP_KEY
    )
    .map((group) => group.groupId)
  if (permissionGroupIds.length === 0) return new Set()

  const result = await Sfsures_groupresourcetypeaccessesService.getAll({
    select: ['_sfsures_group_value', '_sfsures_resourcetype_value', 'sfsures_accesslevel'],
    filter: 'statecode eq 0',
    top: 5000,
  })
  const activeGroupIds = new Set(permissionGroupIds)

  return new Set(
    (result.data ?? [])
      .filter(
        (access) =>
          !!access._sfsures_group_value &&
          activeGroupIds.has(access._sfsures_group_value) &&
          !!access._sfsures_resourcetype_value &&
          (requirement === 'view' || access.sfsures_accesslevel === ACCESS_LEVEL_BOOK)
      )
      .map((access) => access._sfsures_resourcetype_value as string)
  )
}
