using Microsoft.Xrm.Sdk;

namespace Sfsures.Plugins
{
    public sealed class ReservationOccurrenceCreateGuard : PluginBase
    {
        private const string ReservationOccurrenceTableName = "sfsures_reservationoccurrence";

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
                $"ReservationOccurrenceCreateGuard trace-only execution. Message={context.MessageName}, PrimaryEntityName={context.PrimaryEntityName}, Stage={context.Stage}, Mode={context.Mode}");

            if (!string.Equals(context.MessageName, "Create", System.StringComparison.OrdinalIgnoreCase) ||
                !string.Equals(context.PrimaryEntityName, ReservationOccurrenceTableName, System.StringComparison.OrdinalIgnoreCase))
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
        }
    }
}
