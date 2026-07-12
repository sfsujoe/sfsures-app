import type { Sfsures_appusers } from '../generated/models/Sfsures_appusersModel'
import { Sfsures_appusersService } from '../generated/services/Sfsures_appusersService'
import { Sfsures_groupresourcetypeaccessesService } from '../generated/services/Sfsures_groupresourcetypeaccessesService'
import { Sfsures_groupsService } from '../generated/services/Sfsures_groupsService'
import { Sfsures_usergroupassignmentsService } from '../generated/services/Sfsures_usergroupassignmentsService'
import { APP_ADMIN_GROUP_KEY, REPORT_VIEWERS_GROUP_KEY } from '../auth/UserContext'

const RECORD_STATUS_ACTIVE = 997330000
const ACCESS_LEVEL_BOOK = 997330000

export interface ReservationOwnerOption {
  appUserId: string
  sfStateId: string
  displayName: string
  email: string
  systemUserId: string
}

function toOwnerOption(user: Sfsures_appusers): ReservationOwnerOption | null {
  const systemUserId = user._sfsures_dataverseuser_value
  if (!user.sfsures_appuserid || !user.sfsures_sfstateid || !systemUserId) return null

  return {
    appUserId: user.sfsures_appuserid,
    sfStateId: user.sfsures_sfstateid,
    displayName: user.sfsures_displayname?.trim() || user.sfsures_sfstateid,
    email: user.sfsures_email?.trim() || '',
    systemUserId,
  }
}

export async function loadMappedOwner(
  appUserId: string,
  requireActive = true
): Promise<ReservationOwnerOption | null> {
  const result = await Sfsures_appusersService.get(appUserId, {
    select: [
      'sfsures_appuserid',
      'sfsures_sfstateid',
      'sfsures_displayname',
      'sfsures_email',
      'sfsures_recordstatus',
      '_sfsures_dataverseuser_value',
    ],
  })
  const user = result.data
  if (!user || (requireActive && user.sfsures_recordstatus !== RECORD_STATUS_ACTIVE)) return null
  return toOwnerOption(user)
}

export async function loadEligibleReservationOwners(
  resourceTypeId: string
): Promise<ReservationOwnerOption[]> {
  const [usersResult, assignmentsResult, typeAccessResult, groupsResult] =
    await Promise.all([
      Sfsures_appusersService.getAll({
        select: [
          'sfsures_appuserid',
          'sfsures_sfstateid',
          'sfsures_displayname',
          'sfsures_email',
          'sfsures_recordstatus',
          '_sfsures_dataverseuser_value',
        ],
        filter: `sfsures_recordstatus eq ${RECORD_STATUS_ACTIVE}`,
        orderBy: ['sfsures_displayname asc'],
        top: 500,
      }),
      Sfsures_usergroupassignmentsService.getAll({
        select: ['_sfsures_user_value', '_sfsures_group_value'],
        filter: 'statecode eq 0',
        top: 5000,
      }),
      Sfsures_groupresourcetypeaccessesService.getAll({
        select: ['_sfsures_group_value', '_sfsures_resourcetype_value', 'sfsures_accesslevel'],
        filter:
          `_sfsures_resourcetype_value eq ${resourceTypeId}` +
          ` and sfsures_accesslevel eq ${ACCESS_LEVEL_BOOK}` +
          ' and statecode eq 0',
        top: 500,
      }),
      Sfsures_groupsService.getAll({
        select: ['sfsures_groupid', 'sfsures_groupkey', 'sfsures_recordstatus'],
        filter: `sfsures_recordstatus eq ${RECORD_STATUS_ACTIVE}`,
        top: 500,
      }),
    ])

  const protectedGroupIds = new Set(
    (groupsResult.data ?? [])
      .filter((group) => {
        const key = group.sfsures_groupkey?.trim().toUpperCase()
        return key === APP_ADMIN_GROUP_KEY || key === REPORT_VIEWERS_GROUP_KEY
      })
      .map((group) => group.sfsures_groupid)
  )
  const bookingGroupIds = new Set<string>()
  for (const access of typeAccessResult.data ?? []) {
    if (
      access._sfsures_group_value &&
      !protectedGroupIds.has(access._sfsures_group_value)
    ) {
      bookingGroupIds.add(access._sfsures_group_value)
    }
  }

  const eligibleUserIds = new Set<string>()
  for (const assignment of assignmentsResult.data ?? []) {
    if (
      assignment._sfsures_user_value &&
      assignment._sfsures_group_value &&
      bookingGroupIds.has(assignment._sfsures_group_value)
    ) {
      eligibleUserIds.add(assignment._sfsures_user_value)
    }
  }

  return ((usersResult.data ?? []) as Sfsures_appusers[])
    .filter((user) => eligibleUserIds.has(user.sfsures_appuserid))
    .map(toOwnerOption)
    .filter((owner): owner is ReservationOwnerOption => owner !== null)
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
}

export function reservationOwnerSnapshot(owner: ReservationOwnerOption) {
  return {
    appUserId: owner.appUserId,
    sfStateId: owner.sfStateId,
    displayName: owner.displayName,
    mappedSystemUserId: owner.systemUserId,
  }
}
