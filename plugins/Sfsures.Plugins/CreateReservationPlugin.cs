using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using System;
using System.Globalization;

namespace Sfsures.Plugins
{
    public sealed class CreateReservationPlugin : PluginBase
    {
        private const int ActiveStateCode = 0;
        private const int ActiveStatusCode = 1;
        private const int ActiveRecordStatus = 997330000;
        private const int DisabledAppUserStatus = 997330001;
        private const int DisabledResourceStatus = 997330001;
        private const int InactiveGroupStatus = 997330001;
        private const int InactiveResourceTypeStatus = 997330001;
        private const int PendingReservationStatus = 997330002;
        private const int BookAccessLevel = 997330000;
        private const int ResourceApprovalInherit = 997330000;
        private const int ResourceApprovalRequired = 997330002;
        private const int AttributeAppliesToReservation = 997330001;
        private const int ReservationCreatedActionType = 997330000;
        private const int ReservationTargetType = 997330000;
        private const int ActionEntryType = 997330001;
        private const int SuccessOutcome = 997330000;
        private const int MaxFutureOccurrencesPerOwner = 200;

        private const string ApiName = "sfsures_CreateReservation";
        private const string AppAdminGroupKey = "APP_ADMINS";
        private const string ReportViewersGroupKey = "REPORT_VIEWERS";

        private const string AppUserTableName = "sfsures_appuser";
        private const string AttributeDefinitionTableName = "sfsures_attributedefinition";
        private const string AuditLogTableName = "sfsures_auditlog";
        private const string BlackoutWindowTableName = "sfsures_blackoutwindow";
        private const string GroupResourceTypeAccessTableName = "sfsures_groupresourcetypeaccess";
        private const string GroupTableName = "sfsures_group";
        private const string ReservationOccurrenceTableName = "sfsures_reservationoccurrence";
        private const string ResourceTableName = "sfsures_resource";
        private const string ResourceTypeTableName = "sfsures_resourcetype";
        private const string UserGroupAssignmentTableName = "sfsures_usergroupassignment";

        private const string BookingOwnerColumn = "sfsures_bookingowner";
        private const string CommentsColumn = "sfsures_comments";
        private const string DataverseUserColumn = "sfsures_dataverseuser";
        private const string DisplayNameColumn = "sfsures_displayname";
        private const string EndColumn = "sfsures_end";
        private const string GroupColumn = "sfsures_group";
        private const string GroupKeyColumn = "sfsures_groupkey";
        private const string NameColumn = "sfsures_name";
        private const string OwnerIdColumn = "ownerid";
        private const string RecordStatusColumn = "sfsures_recordstatus";
        private const string ResourceColumn = "sfsures_resource";
        private const string RequiresApprovalColumn = "sfsures_requiresapproval";
        private const string ResourceTypeColumn = "sfsures_resourcetype";
        private const string ResourceTypeStatusColumn = "sfsures_status";
        private const string SfStateIdColumn = "sfsures_sfstateid";
        private const string StartColumn = "sfsures_start";
        private const string StateCodeColumn = "statecode";
        private const string StatusCodeColumn = "statuscode";
        private const string UserColumn = "sfsures_user";

        public CreateReservationPlugin()
            : base(typeof(CreateReservationPlugin))
        {
        }

        protected override void ExecuteCdsPlugin(ILocalPluginContext localPluginContext)
        {
            if (localPluginContext == null)
            {
                throw new InvalidPluginExecutionException("localPluginContext");
            }

            var context = localPluginContext.PluginExecutionContext;
            localPluginContext.Trace(
                $"CreateReservationPlugin execution. Message={context.MessageName}, Stage={context.Stage}, Mode={context.Mode}");

            if (!string.Equals(context.MessageName, ApiName, StringComparison.OrdinalIgnoreCase))
            {
                localPluginContext.Trace("CreateReservationPlugin skipped because the message name did not match.");
                return;
            }

            var request = ReadRequest(localPluginContext);
            var caller = ResolveCaller(localPluginContext);
            var bookingOwner = ResolveBookingOwner(localPluginContext, request.BookingOwnerAppUserId);
            var resource = ResolveResource(localPluginContext, request.ResourceId);

            if (!caller.AppUserId.Equals(bookingOwner.AppUserId) && !caller.IsAppAdmin)
            {
                Fail(localPluginContext, "DelegatedBookingDenied", "Only an App Admin can create a reservation for another user.");
            }

            if (!HasBookAccess(localPluginContext, bookingOwner.AppUserId, resource.ResourceTypeId))
            {
                Fail(localPluginContext, "BookPermissionDenied", "The selected booking owner does not have Book access for this resource.");
            }

            if (resource.ApprovalRequired && !caller.IsAppAdmin)
            {
                Fail(localPluginContext, "ApprovalRoutingUnavailable", "Approval-required reservation submission is not implemented in this first Custom API slice.");
            }

            ValidateNoRequiredCustomFields(localPluginContext, resource);
            ValidateNoOverlaps(localPluginContext, request, resource.ResourceId);
            ValidateQuota(localPluginContext, bookingOwner.AppUserId);

            var occurrenceId = CreateOccurrence(localPluginContext, request, bookingOwner, resource);
            TryWriteAuditLog(localPluginContext, request, caller, bookingOwner, resource, occurrenceId);
            WriteResponse(context, occurrenceId);

            localPluginContext.Trace($"CreateReservationPlugin created occurrence {occurrenceId}.");
        }

        private static CreateReservationRequest ReadRequest(ILocalPluginContext localPluginContext)
        {
            var context = localPluginContext.PluginExecutionContext;
            var resourceId = GetRequiredGuid(localPluginContext, context, "ResourceId");
            var bookingOwnerAppUserId = GetRequiredGuid(localPluginContext, context, "BookingOwnerAppUserId");
            var start = GetRequiredDateTime(localPluginContext, context, "Start");
            var end = GetRequiredDateTime(localPluginContext, context, "End");
            var recurrenceJson = GetOptionalString(context, "RecurrenceJson");
            var customFieldsJson = GetOptionalString(context, "CustomFieldsJson");

            if (end <= start)
            {
                Fail(localPluginContext, "InvalidTimeRange", "Reservation End must be after Start.");
            }

            if (!string.IsNullOrWhiteSpace(recurrenceJson))
            {
                Fail(localPluginContext, "ReservationLimitExceeded", "Recurring reservations are not implemented in this first Custom API slice.");
            }

            if (!string.IsNullOrWhiteSpace(customFieldsJson))
            {
                Fail(localPluginContext, "CustomFieldInvalid", "Reservation custom fields are not implemented in this first Custom API slice.");
            }

            return new CreateReservationRequest
            {
                ResourceId = resourceId,
                BookingOwnerAppUserId = bookingOwnerAppUserId,
                Start = start,
                End = end,
                Comments = TrimToNull(GetOptionalString(context, "Comments")),
                ClientRequestId = TrimToNull(GetOptionalString(context, "ClientRequestId"))
            };
        }

        private static AppUserContext ResolveCaller(ILocalPluginContext localPluginContext)
        {
            var initiatingUserId = localPluginContext.PluginExecutionContext.InitiatingUserId;
            var appUsers = QueryByLookup(
                localPluginContext,
                AppUserTableName,
                DataverseUserColumn,
                initiatingUserId,
                new ColumnSet(
                    $"{AppUserTableName}id",
                    SfStateIdColumn,
                    DisplayNameColumn,
                    DataverseUserColumn,
                    RecordStatusColumn));

            if (appUsers.Entities.Count != 1)
            {
                Fail(localPluginContext, "CallerNotOnboarded", "The caller is not mapped to exactly one active SFSURES App User.");
            }

            var caller = ToAppUserContext(localPluginContext, appUsers.Entities[0], "CallerNotOnboarded", "Caller App User is disabled or missing its Dataverse User mapping.");
            caller.IsAppAdmin = IsAppAdmin(localPluginContext, caller.AppUserId);
            return caller;
        }

        private static AppUserContext ResolveBookingOwner(ILocalPluginContext localPluginContext, Guid appUserId)
        {
            Entity appUser;
            try
            {
                appUser = localPluginContext.SystemUserService.Retrieve(
                    AppUserTableName,
                    appUserId,
                    new ColumnSet(
                        $"{AppUserTableName}id",
                        SfStateIdColumn,
                        DisplayNameColumn,
                        DataverseUserColumn,
                        RecordStatusColumn));
            }
            catch (Exception ex)
            {
                localPluginContext.Trace($"CreateReservationPlugin could not retrieve booking owner. Fault={ex.Message}");
                Fail(localPluginContext, "BookingOwnerInvalid", "The requested booking owner could not be found.");
                throw;
            }

            return ToAppUserContext(localPluginContext, appUser, "BookingOwnerInvalid", "The requested booking owner is disabled or missing its Dataverse User mapping.");
        }

        private static ResourceContext ResolveResource(ILocalPluginContext localPluginContext, Guid resourceId)
        {
            Entity resource;
            try
            {
                resource = localPluginContext.SystemUserService.Retrieve(
                    ResourceTableName,
                    resourceId,
                    new ColumnSet("sfsures_approvalmode", NameColumn, StateCodeColumn, RecordStatusColumn, ResourceTypeColumn));
            }
            catch (Exception ex)
            {
                localPluginContext.Trace($"CreateReservationPlugin could not retrieve resource. Fault={ex.Message}");
                Fail(localPluginContext, "ResourceUnavailable", "The selected resource could not be found.");
                throw;
            }

            if (resource.GetAttributeValue<OptionSetValue>(StateCodeColumn)?.Value != ActiveStateCode ||
                resource.GetAttributeValue<OptionSetValue>(RecordStatusColumn)?.Value == DisabledResourceStatus)
            {
                Fail(localPluginContext, "ResourceUnavailable", "The selected resource is inactive or disabled.");
            }

            var resourceTypeReference = resource.GetAttributeValue<EntityReference>(ResourceTypeColumn);
            if (resourceTypeReference == null || resourceTypeReference.Id == Guid.Empty)
            {
                Fail(localPluginContext, "ResourceUnavailable", "The selected resource is not attached to an active Resource Type.");
            }

            Entity resourceType;
            try
            {
                resourceType = localPluginContext.SystemUserService.Retrieve(
                    ResourceTypeTableName,
                    resourceTypeReference.Id,
                    new ColumnSet(NameColumn, RequiresApprovalColumn, StateCodeColumn, ResourceTypeStatusColumn));
            }
            catch (Exception ex)
            {
                localPluginContext.Trace($"CreateReservationPlugin could not retrieve resource type. Fault={ex.Message}");
                Fail(localPluginContext, "ResourceUnavailable", "The selected Resource Type could not be found.");
                throw;
            }

            if (resourceType.GetAttributeValue<OptionSetValue>(StateCodeColumn)?.Value != ActiveStateCode ||
                resourceType.GetAttributeValue<OptionSetValue>(ResourceTypeStatusColumn)?.Value == InactiveResourceTypeStatus)
            {
                Fail(localPluginContext, "ResourceUnavailable", "The selected Resource Type is inactive.");
            }

            var resourceApprovalMode = resource.GetAttributeValue<OptionSetValue>("sfsures_approvalmode")?.Value ?? ResourceApprovalInherit;
            var resourceTypeRequiresApproval = resourceType.GetAttributeValue<bool?>(RequiresApprovalColumn) == true;
            var approvalRequired = resourceApprovalMode == ResourceApprovalRequired ||
                (resourceApprovalMode == ResourceApprovalInherit && resourceTypeRequiresApproval);

            return new ResourceContext
            {
                ResourceId = resource.Id,
                ResourceName = resource.GetAttributeValue<string>(NameColumn) ?? "Reservation",
                ResourceTypeId = resourceTypeReference.Id,
                ApprovalRequired = approvalRequired
            };
        }

        private static bool IsAppAdmin(ILocalPluginContext localPluginContext, Guid appUserId)
        {
            return UserHasGroupKey(localPluginContext, appUserId, AppAdminGroupKey);
        }

        private static bool UserHasGroupKey(ILocalPluginContext localPluginContext, Guid appUserId, string groupKey)
        {
            var query = new QueryExpression(UserGroupAssignmentTableName)
            {
                ColumnSet = new ColumnSet(false),
                TopCount = 1
            };
            query.Criteria.AddCondition(StateCodeColumn, ConditionOperator.Equal, ActiveStateCode);
            query.Criteria.AddCondition(UserColumn, ConditionOperator.Equal, appUserId);

            var groupLink = query.AddLink(GroupTableName, GroupColumn, $"{GroupTableName}id", JoinOperator.Inner);
            groupLink.LinkCriteria.AddCondition(StateCodeColumn, ConditionOperator.Equal, ActiveStateCode);
            groupLink.LinkCriteria.AddCondition(RecordStatusColumn, ConditionOperator.NotEqual, InactiveGroupStatus);
            groupLink.LinkCriteria.AddCondition(GroupKeyColumn, ConditionOperator.Equal, groupKey);

            return localPluginContext.SystemUserService.RetrieveMultiple(query).Entities.Count > 0;
        }

        private static bool HasBookAccess(ILocalPluginContext localPluginContext, Guid appUserId, Guid resourceTypeId)
        {
            var query = new QueryExpression(UserGroupAssignmentTableName)
            {
                ColumnSet = new ColumnSet(false),
                TopCount = 1
            };
            query.Criteria.AddCondition(StateCodeColumn, ConditionOperator.Equal, ActiveStateCode);
            query.Criteria.AddCondition(UserColumn, ConditionOperator.Equal, appUserId);

            var groupLink = query.AddLink(GroupTableName, GroupColumn, $"{GroupTableName}id", JoinOperator.Inner);
            groupLink.LinkCriteria.AddCondition(StateCodeColumn, ConditionOperator.Equal, ActiveStateCode);
            groupLink.LinkCriteria.AddCondition(RecordStatusColumn, ConditionOperator.NotEqual, InactiveGroupStatus);
            groupLink.LinkCriteria.AddCondition(GroupKeyColumn, ConditionOperator.NotEqual, AppAdminGroupKey);
            groupLink.LinkCriteria.AddCondition(GroupKeyColumn, ConditionOperator.NotEqual, ReportViewersGroupKey);

            var accessLink = groupLink.AddLink(GroupResourceTypeAccessTableName, $"{GroupTableName}id", GroupColumn, JoinOperator.Inner);
            accessLink.LinkCriteria.AddCondition(StateCodeColumn, ConditionOperator.Equal, ActiveStateCode);
            accessLink.LinkCriteria.AddCondition(ResourceTypeColumn, ConditionOperator.Equal, resourceTypeId);
            accessLink.LinkCriteria.AddCondition("sfsures_accesslevel", ConditionOperator.Equal, BookAccessLevel);

            return localPluginContext.SystemUserService.RetrieveMultiple(query).Entities.Count > 0;
        }

        private static void ValidateNoOverlaps(ILocalPluginContext localPluginContext, CreateReservationRequest request, Guid resourceId)
        {
            var occurrenceQuery = new QueryExpression(ReservationOccurrenceTableName)
            {
                ColumnSet = new ColumnSet($"{ReservationOccurrenceTableName}id"),
                TopCount = 1
            };
            occurrenceQuery.Criteria.AddCondition(ResourceColumn, ConditionOperator.Equal, resourceId);
            occurrenceQuery.Criteria.AddCondition(StartColumn, ConditionOperator.LessThan, request.End);
            occurrenceQuery.Criteria.AddCondition(EndColumn, ConditionOperator.GreaterThan, request.Start);
            occurrenceQuery.Criteria.AddCondition(RecordStatusColumn, ConditionOperator.In, ActiveRecordStatus, PendingReservationStatus);

            if (localPluginContext.SystemUserService.RetrieveMultiple(occurrenceQuery).Entities.Count > 0)
            {
                Fail(localPluginContext, "ConflictDetected", "The requested time overlaps an existing active or pending reservation.");
            }

            var blackoutQuery = new QueryExpression(BlackoutWindowTableName)
            {
                ColumnSet = new ColumnSet($"{BlackoutWindowTableName}id"),
                TopCount = 1
            };
            blackoutQuery.Criteria.AddCondition(StateCodeColumn, ConditionOperator.Equal, ActiveStateCode);
            blackoutQuery.Criteria.AddCondition(ResourceColumn, ConditionOperator.Equal, resourceId);
            blackoutQuery.Criteria.AddCondition(StartColumn, ConditionOperator.LessThan, request.End);
            blackoutQuery.Criteria.AddCondition(EndColumn, ConditionOperator.GreaterThan, request.Start);

            if (localPluginContext.SystemUserService.RetrieveMultiple(blackoutQuery).Entities.Count > 0)
            {
                Fail(localPluginContext, "BlackoutConflictDetected", "The requested time overlaps a blackout window.");
            }
        }

        private static void ValidateNoRequiredCustomFields(ILocalPluginContext localPluginContext, ResourceContext resource)
        {
            var query = new QueryExpression(AttributeDefinitionTableName)
            {
                ColumnSet = new ColumnSet($"{AttributeDefinitionTableName}id"),
                TopCount = 1
            };
            query.Criteria.AddCondition(StateCodeColumn, ConditionOperator.Equal, ActiveStateCode);
            query.Criteria.AddCondition("sfsures_appliesto", ConditionOperator.Equal, AttributeAppliesToReservation);
            query.Criteria.AddCondition("sfsures_required", ConditionOperator.Equal, true);

            var scopeFilter = query.Criteria.AddFilter(LogicalOperator.Or);
            scopeFilter.AddCondition(ResourceColumn, ConditionOperator.Equal, resource.ResourceId);
            scopeFilter.AddCondition(ResourceTypeColumn, ConditionOperator.Equal, resource.ResourceTypeId);

            if (localPluginContext.SystemUserService.RetrieveMultiple(query).Entities.Count > 0)
            {
                Fail(localPluginContext, "CustomFieldInvalid", "Required reservation custom fields are not implemented in this first Custom API slice.");
            }
        }

        private static void ValidateQuota(ILocalPluginContext localPluginContext, Guid bookingOwnerAppUserId)
        {
            var query = new QueryExpression(ReservationOccurrenceTableName)
            {
                ColumnSet = new ColumnSet($"{ReservationOccurrenceTableName}id"),
                TopCount = MaxFutureOccurrencesPerOwner + 1
            };
            query.Criteria.AddCondition(BookingOwnerColumn, ConditionOperator.Equal, bookingOwnerAppUserId);
            query.Criteria.AddCondition(EndColumn, ConditionOperator.OnOrAfter, DateTime.UtcNow);
            query.Criteria.AddCondition(RecordStatusColumn, ConditionOperator.In, ActiveRecordStatus, PendingReservationStatus);

            var currentCount = localPluginContext.SystemUserService.RetrieveMultiple(query).Entities.Count;
            if (currentCount >= MaxFutureOccurrencesPerOwner)
            {
                Fail(localPluginContext, "QuotaExceeded", "The booking owner has reached the maximum number of future active or pending reservation occurrences.");
            }
        }

        private static Guid CreateOccurrence(
            ILocalPluginContext localPluginContext,
            CreateReservationRequest request,
            AppUserContext bookingOwner,
            ResourceContext resource)
        {
            var occurrence = new Entity(ReservationOccurrenceTableName)
            {
                [NameColumn] = $"{resource.ResourceName} {request.Start.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)}",
                [StartColumn] = request.Start,
                [EndColumn] = request.End,
                [RecordStatusColumn] = new OptionSetValue(ActiveRecordStatus),
                [ResourceColumn] = new EntityReference(ResourceTableName, resource.ResourceId),
                [BookingOwnerColumn] = new EntityReference(AppUserTableName, bookingOwner.AppUserId),
                [OwnerIdColumn] = new EntityReference("systemuser", bookingOwner.SystemUserId),
                [StateCodeColumn] = new OptionSetValue(ActiveStateCode),
                [StatusCodeColumn] = new OptionSetValue(ActiveStatusCode)
            };

            if (!string.IsNullOrWhiteSpace(request.Comments))
            {
                occurrence[CommentsColumn] = request.Comments;
            }

            return localPluginContext.SystemUserService.Create(occurrence);
        }

        private static void TryWriteAuditLog(
            ILocalPluginContext localPluginContext,
            CreateReservationRequest request,
            AppUserContext caller,
            AppUserContext bookingOwner,
            ResourceContext resource,
            Guid occurrenceId)
        {
            try
            {
                var now = DateTime.UtcNow;
                var details =
                    "{" +
                    "\"api\":\"sfsures_CreateReservation\"," +
                    $"\"clientRequestId\":{JsonStringOrNull(request.ClientRequestId)}," +
                    "\"outcome\":\"Created\"," +
                    "\"reservationScope\":\"Single\"," +
                    $"\"affectedRowIds\":[\"{occurrenceId}\"]," +
                    $"\"bookingOwnerAppUserId\":\"{bookingOwner.AppUserId}\"," +
                    $"\"callerAppUserId\":\"{caller.AppUserId}\"," +
                    "\"approvalRequired\":false," +
                    "\"occurrenceCount\":1," +
                    "\"reservableHoursOverride\":false" +
                    "}";

                var audit = new Entity(AuditLogTableName)
                {
                    [NameColumn] = $"ReservationCreated {now.ToString("u", CultureInfo.InvariantCulture)}",
                    ["sfsures_entrytype"] = new OptionSetValue(ActionEntryType),
                    ["sfsures_actiontype"] = new OptionSetValue(ReservationCreatedActionType),
                    ["sfsures_outcome"] = new OptionSetValue(SuccessOutcome),
                    ["sfsures_targettype"] = new OptionSetValue(ReservationTargetType),
                    ["sfsures_targetid"] = occurrenceId.ToString("D"),
                    ["sfsures_targetlabel"] = resource.ResourceName,
                    ["sfsures_actiontimestamp"] = now,
                    ["sfsures_actorsfstateid"] = caller.SfStateId,
                    ["sfsures_actordisplayname"] = caller.DisplayName,
                    ["sfsures_afterstate"] = $"{{\"appUserId\":\"{bookingOwner.AppUserId}\",\"sfStateId\":{JsonStringOrNull(bookingOwner.SfStateId)},\"displayName\":{JsonStringOrNull(bookingOwner.DisplayName)},\"mappedSystemUserId\":\"{bookingOwner.SystemUserId}\"}}",
                    ["sfsures_details"] = details,
                    [StateCodeColumn] = new OptionSetValue(ActiveStateCode),
                    [StatusCodeColumn] = new OptionSetValue(ActiveStatusCode)
                };

                localPluginContext.SystemUserService.Create(audit);
            }
            catch (Exception ex)
            {
                localPluginContext.Trace($"CreateReservationPlugin could not write audit log. Fault={ex.Message}");
            }
        }

        private static void WriteResponse(IPluginExecutionContext context, Guid occurrenceId)
        {
            context.OutputParameters["Success"] = true;
            context.OutputParameters["Outcome"] = "Created";
            context.OutputParameters["ReservationScope"] = "Single";
            context.OutputParameters["ReservationOccurrenceId"] = occurrenceId;
            context.OutputParameters["OccurrenceIdsJson"] = $"[\"{occurrenceId}\"]";
            context.OutputParameters["OccurrenceCount"] = 1;
            context.OutputParameters["RecordStatus"] = "Active";
            context.OutputParameters["Message"] = "Reservation created.";
        }

        private static AppUserContext ToAppUserContext(
            ILocalPluginContext localPluginContext,
            Entity appUser,
            string errorCode,
            string errorMessage)
        {
            if (appUser.GetAttributeValue<OptionSetValue>(RecordStatusColumn)?.Value == DisabledAppUserStatus)
            {
                Fail(localPluginContext, errorCode, errorMessage);
            }

            var systemUserReference = appUser.GetAttributeValue<EntityReference>(DataverseUserColumn);
            if (systemUserReference == null || systemUserReference.Id == Guid.Empty)
            {
                Fail(localPluginContext, errorCode, errorMessage);
            }

            return new AppUserContext
            {
                AppUserId = appUser.Id,
                SystemUserId = systemUserReference.Id,
                SfStateId = appUser.GetAttributeValue<string>(SfStateIdColumn),
                DisplayName = appUser.GetAttributeValue<string>(DisplayNameColumn) ?? appUser.GetAttributeValue<string>(SfStateIdColumn) ?? "Unknown user"
            };
        }

        private static EntityCollection QueryByLookup(
            ILocalPluginContext localPluginContext,
            string tableName,
            string lookupColumnName,
            Guid lookupId,
            ColumnSet columns)
        {
            var query = new QueryExpression(tableName)
            {
                ColumnSet = columns,
                TopCount = 2
            };
            query.Criteria.AddCondition(StateCodeColumn, ConditionOperator.Equal, ActiveStateCode);
            query.Criteria.AddCondition(RecordStatusColumn, ConditionOperator.Equal, ActiveRecordStatus);
            query.Criteria.AddCondition(lookupColumnName, ConditionOperator.Equal, lookupId);
            return localPluginContext.SystemUserService.RetrieveMultiple(query);
        }

        private static Guid GetRequiredGuid(
            ILocalPluginContext localPluginContext,
            IPluginExecutionContext context,
            string parameterName)
        {
            if (!context.InputParameters.Contains(parameterName) || !(context.InputParameters[parameterName] is Guid))
            {
                Fail(localPluginContext, "CreateReservationFailed", $"{parameterName} is required.");
            }

            var value = (Guid)context.InputParameters[parameterName];
            if (value == Guid.Empty)
            {
                Fail(localPluginContext, "CreateReservationFailed", $"{parameterName} is required.");
            }

            return value;
        }

        private static DateTime GetRequiredDateTime(
            ILocalPluginContext localPluginContext,
            IPluginExecutionContext context,
            string parameterName)
        {
            if (!context.InputParameters.Contains(parameterName) || !(context.InputParameters[parameterName] is DateTime))
            {
                Fail(localPluginContext, "InvalidTimeRange", $"{parameterName} is required.");
            }

            var value = (DateTime)context.InputParameters[parameterName];
            return value;
        }

        private static string GetOptionalString(IPluginExecutionContext context, string parameterName)
        {
            if (!context.InputParameters.Contains(parameterName) || context.InputParameters[parameterName] == null)
            {
                return null;
            }

            return context.InputParameters[parameterName] as string;
        }

        private static string TrimToNull(string value)
        {
            if (string.IsNullOrWhiteSpace(value))
            {
                return null;
            }

            return value.Trim();
        }

        private static string JsonStringOrNull(string value)
        {
            if (string.IsNullOrEmpty(value))
            {
                return "null";
            }

            return "\"" + value.Replace("\\", "\\\\").Replace("\"", "\\\"") + "\"";
        }

        private static void Fail(ILocalPluginContext localPluginContext, string code, string message)
        {
            localPluginContext.Trace($"CreateReservationPlugin blocked request: {code}: {message}");
            throw new InvalidPluginExecutionException($"{code}: {message}");
        }

        private sealed class CreateReservationRequest
        {
            public Guid ResourceId { get; set; }

            public Guid BookingOwnerAppUserId { get; set; }

            public DateTime Start { get; set; }

            public DateTime End { get; set; }

            public string Comments { get; set; }

            public string ClientRequestId { get; set; }
        }

        private sealed class AppUserContext
        {
            public Guid AppUserId { get; set; }

            public Guid SystemUserId { get; set; }

            public string SfStateId { get; set; }

            public string DisplayName { get; set; }

            public bool IsAppAdmin { get; set; }
        }

        private sealed class ResourceContext
        {
            public Guid ResourceId { get; set; }

            public Guid ResourceTypeId { get; set; }

            public string ResourceName { get; set; }

            public bool ApprovalRequired { get; set; }
        }
    }
}
