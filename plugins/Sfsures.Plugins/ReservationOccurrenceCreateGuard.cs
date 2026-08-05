using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using System;
using System.ServiceModel;

namespace Sfsures.Plugins
{
    public sealed class ReservationOccurrenceCreateGuard : PluginBase
    {
        private const int ActiveStateCode = 0;
        private const int DisabledResourceStatus = 997330001;
        private const int InactiveResourceTypeStatus = 997330001;
        private const string ReservationOccurrenceTableName = "sfsures_reservationoccurrence";
        private const string ResourceTableName = "sfsures_resource";
        private const string ResourceTypeTableName = "sfsures_resourcetype";
        private const string AppUserTableName = "sfsures_appuser";
        private const string BookingOwnerColumn = "sfsures_bookingowner";
        private const string EndColumn = "sfsures_end";
        private const string RecordStatusColumn = "sfsures_recordstatus";
        private const string ResourceColumn = "sfsures_resource";
        private const string ResourceTypeColumn = "sfsures_resourcetype";
        private const string ResourceTypeStatusColumn = "sfsures_status";
        private const string StartColumn = "sfsures_start";
        private const string StateCodeColumn = "statecode";

        public ReservationOccurrenceCreateGuard()
            : base(typeof(ReservationOccurrenceCreateGuard))
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
                $"ReservationOccurrenceCreateGuard execution. Message={context.MessageName}, PrimaryEntityName={context.PrimaryEntityName}, Stage={context.Stage}, Mode={context.Mode}");

            if (!string.Equals(context.MessageName, "Create", StringComparison.OrdinalIgnoreCase) ||
                !string.Equals(context.PrimaryEntityName, ReservationOccurrenceTableName, StringComparison.OrdinalIgnoreCase))
            {
                localPluginContext.Trace("ReservationOccurrenceCreateGuard skipped because the step context does not match the expected Create message on Reservation Occurrence.");
                return;
            }

            if (!context.InputParameters.Contains("Target") ||
                !(context.InputParameters["Target"] is Entity target))
            {
                localPluginContext.Trace("ReservationOccurrenceCreateGuard skipped because the Target entity was not available.");
                return;
            }

            localPluginContext.Trace(
                $"ReservationOccurrenceCreateGuard observed reservation occurrence create. LogicalName={target.LogicalName}, AttributeCount={target.Attributes.Count}");

            var resourceReference = ValidateLookup(localPluginContext, target, ResourceColumn, ResourceTableName, "Resource");
            ValidateLookup(localPluginContext, target, BookingOwnerColumn, AppUserTableName, "Booking Owner");

            var start = ValidateDateTime(localPluginContext, target, StartColumn, "Start");
            var end = ValidateDateTime(localPluginContext, target, EndColumn, "End");

            if (end <= start)
            {
                Fail(localPluginContext, "Reservation End must be after Start.");
            }

            localPluginContext.Trace("ReservationOccurrenceCreateGuard required-field validation passed.");

            ValidateResource(localPluginContext, resourceReference);

            localPluginContext.Trace("ReservationOccurrenceCreateGuard resource validation passed.");
        }

        private static EntityReference ValidateLookup(
            ILocalPluginContext localPluginContext,
            Entity target,
            string columnName,
            string expectedTableName,
            string displayName)
        {
            var value = target.GetAttributeValue<EntityReference>(columnName);
            if (value == null || value.Id == Guid.Empty)
            {
                Fail(localPluginContext, $"Reservation {displayName} is required.");
            }

            if (!string.Equals(value.LogicalName, expectedTableName, StringComparison.OrdinalIgnoreCase))
            {
                Fail(localPluginContext, $"Reservation {displayName} must reference {expectedTableName}.");
            }

            return value;
        }

        private static DateTime ValidateDateTime(
            ILocalPluginContext localPluginContext,
            Entity target,
            string columnName,
            string displayName)
        {
            var value = target.GetAttributeValue<DateTime?>(columnName);
            if (!value.HasValue)
            {
                Fail(localPluginContext, $"Reservation {displayName} is required.");
            }

            return value.Value;
        }

        private static void ValidateResource(ILocalPluginContext localPluginContext, EntityReference resourceReference)
        {
            var resource = RetrieveForValidation(
                localPluginContext,
                resourceReference,
                new ColumnSet(StateCodeColumn, RecordStatusColumn, ResourceTypeColumn),
                "Resource");

            var resourceState = resource.GetAttributeValue<OptionSetValue>(StateCodeColumn)?.Value;
            if (resourceState != ActiveStateCode)
            {
                Fail(localPluginContext, "Reservation Resource must be active.");
            }

            var resourceRecordStatus = resource.GetAttributeValue<OptionSetValue>(RecordStatusColumn)?.Value;
            if (resourceRecordStatus == DisabledResourceStatus)
            {
                Fail(localPluginContext, "Reservation Resource is disabled.");
            }

            var resourceTypeReference = resource.GetAttributeValue<EntityReference>(ResourceTypeColumn);
            if (resourceTypeReference == null || resourceTypeReference.Id == Guid.Empty)
            {
                Fail(localPluginContext, "Reservation Resource must belong to an active Resource Type.");
            }

            if (!string.Equals(resourceTypeReference.LogicalName, ResourceTypeTableName, StringComparison.OrdinalIgnoreCase))
            {
                Fail(localPluginContext, $"Reservation Resource Type must reference {ResourceTypeTableName}.");
            }

            var resourceType = RetrieveForValidation(
                localPluginContext,
                resourceTypeReference,
                new ColumnSet(StateCodeColumn, ResourceTypeStatusColumn),
                "Resource Type");

            var resourceTypeState = resourceType.GetAttributeValue<OptionSetValue>(StateCodeColumn)?.Value;
            if (resourceTypeState != ActiveStateCode)
            {
                Fail(localPluginContext, "Reservation Resource Type must be active.");
            }

            var resourceTypeStatus = resourceType.GetAttributeValue<OptionSetValue>(ResourceTypeStatusColumn)?.Value;
            if (resourceTypeStatus == InactiveResourceTypeStatus)
            {
                Fail(localPluginContext, "Reservation Resource Type is inactive.");
            }
        }

        private static Entity RetrieveForValidation(
            ILocalPluginContext localPluginContext,
            EntityReference entityReference,
            ColumnSet columns,
            string displayName)
        {
            try
            {
                return localPluginContext.CurrentUserService.Retrieve(
                    entityReference.LogicalName,
                    entityReference.Id,
                    columns);
            }
            catch (FaultException<OrganizationServiceFault> ex)
            {
                localPluginContext.Trace(
                    $"ReservationOccurrenceCreateGuard could not retrieve {displayName}. Fault={ex.Message}");
                Fail(localPluginContext, $"Reservation {displayName} could not be validated.");
                throw;
            }
        }

        private static void Fail(ILocalPluginContext localPluginContext, string message)
        {
            localPluginContext.Trace($"ReservationOccurrenceCreateGuard blocked create: {message}");
            throw new InvalidPluginExecutionException(message);
        }
    }
}
