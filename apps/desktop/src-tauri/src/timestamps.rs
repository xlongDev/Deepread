//! Protocol time format: every timestamp crossing the IPC boundary is an
//! ISO 8601 / RFC 3339 UTC string (spec §14).

use time::OffsetDateTime;
use time::format_description::well_known::Rfc3339;

pub fn rfc3339_now() -> String {
    OffsetDateTime::now_utc()
        .format(&Rfc3339)
        // `now_utc` is infallible and RFC 3339 formatting only fails for years
        // beyond 9999, so this is unreachable in practice.
        .expect("system clock formatting must not fail")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn produces_parseable_rfc3339_utc() {
        let stamp = rfc3339_now();
        let parsed = OffsetDateTime::parse(&stamp, &Rfc3339).expect("must parse as RFC 3339");
        assert_eq!(parsed.offset(), time::UtcOffset::UTC);
    }
}
